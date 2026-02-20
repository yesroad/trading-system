import 'dotenv/config';
import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger, sleep } from '@workspace/shared-utils';
import { getUnconsumedSignals, markSignalConsumed } from '@workspace/db-client';

import { EXECUTE_MARKETS, type Market } from './config/markets.js';
import { TRADING_CONFIG } from './config/trading.js';
import { checkAllGuards } from './decision/guards.js';
import { enqueueNotificationEvent } from './db/notifications.js';
import { KISClient } from './brokers/kis/client.js';
import { UpbitClient } from './brokers/upbit/client.js';

// ✨ Phase 3-6: 새로운 모듈 import
import { validateTradeRisk } from './risk/validator.js';
import { checkCircuitBreaker } from './risk/circuit-breaker.js';
import { logACEEntry } from './compliance/ace-logger.js';
import { startOutcomeTracking } from './compliance/outcome-tracker.js';
import { executeOrder } from './execution/order-executor.js';

const logger = createLogger('trade-executor');

const clients = {
  KIS: new KISClient(),
  UPBIT: new UpbitClient(),
} as const;

const marketRunning = new Map<Market, boolean>();

function nowMinuteKey(): string {
  const iso = DateTime.now().toUTC().startOf('minute').toISO();
  return iso ?? String(DateTime.now().toMillis());
}

function getMarketIntervalMs(market: Market): number {
  if (market === 'CRYPTO') return TRADING_CONFIG.loopIntervalCryptoSec * 1000;
  if (market === 'US') return TRADING_CONFIG.loopIntervalUsSec * 1000;
  return TRADING_CONFIG.loopIntervalKrSec * 1000;
}

function isMarketOpen(market: Market): boolean {
  if (!TRADING_CONFIG.enableMarketHoursGuard) return true;
  if (TRADING_CONFIG.tradeExecutorRunMode === 'NO_CHECK') return true;
  if (market === 'CRYPTO') return true;

  if (market === 'KRX') {
    const now = DateTime.now().setZone('Asia/Seoul');
    if (now.weekday === 6 || now.weekday === 7) return false;

    const minutes = now.hour * 60 + now.minute;
    if (TRADING_CONFIG.tradeExecutorRunMode === 'EXTENDED') {
      return minutes >= 8 * 60 && minutes <= 16 * 60;
    }
    if (TRADING_CONFIG.tradeExecutorRunMode === 'PREMARKET') {
      return minutes >= 8 * 60 && minutes <= 9 * 60;
    }
    if (TRADING_CONFIG.tradeExecutorRunMode === 'AFTERMARKET') {
      return minutes >= 15 * 60 + 30 && minutes <= 16 * 60;
    }
    return minutes >= 9 * 60 && minutes <= 15 * 60 + 30;
  }

  const now = DateTime.now().setZone('America/New_York');
  if (now.weekday === 6 || now.weekday === 7) return false;

  const minutes = now.hour * 60 + now.minute;
  if (TRADING_CONFIG.tradeExecutorRunMode === 'EXTENDED') {
    return minutes >= 4 * 60 && minutes <= 20 * 60;
  }
  if (TRADING_CONFIG.tradeExecutorRunMode === 'PREMARKET') {
    return minutes >= 4 * 60 && minutes <= 9 * 60 + 30;
  }
  if (TRADING_CONFIG.tradeExecutorRunMode === 'AFTERMARKET') {
    return minutes >= 16 * 60 && minutes <= 20 * 60;
  }
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60;
}

/**
 * ✨ 새로운 거래 파이프라인
 *
 * 1. 가드 체크
 * 2. 미소비 신호 조회
 * 3. 리스크 검증
 * 4. ACE 로그 생성
 * 5. 주문 실행
 * 6. 신호 소비 표시
 */
async function runMarketLoop(market: Market): Promise<void> {
  if (marketRunning.get(market)) {
    logger.warn('시장 루프 중복 실행 스킵', { market });
    return;
  }

  marketRunning.set(market, true);

  try {
    // ========================================
    // 1. 장시간 체크
    // ========================================
    if (!isMarketOpen(market)) {
      logger.info('장시간 외 시장 루프 스킵', { market });
      return;
    }

    // ========================================
    // 2. 가드 체크
    // ========================================
    const guards = await checkAllGuards();
    if (guards.recovered) {
      await enqueueNotificationEvent({
        sourceService: 'trade-executor',
        eventType: 'GUARD_RECOVERED',
        level: 'INFO',
        market,
        title: '거래 재개',
        message: `system_guard 자동 복구 완료 (market=${market})`,
        dedupeKey: `guard-recovered:${market}:${nowMinuteKey()}`,
        payload: { guards },
      });
    }

    if (!guards.allowed) {
      logger.warn('가드 차단으로 시장 루프 스킵', {
        market,
        reasons: guards.reasons,
      });

      await enqueueNotificationEvent({
        sourceService: 'trade-executor',
        eventType: 'GUARD_BLOCKED',
        level: 'WARNING',
        market,
        title: '거래 차단',
        message: `system_guard/daily limit 차단: ${guards.reasons.join(' | ')}`,
        dedupeKey: `guard-blocked:${market}:${nowMinuteKey()}`,
        payload: { guards },
      });
      return;
    }

    // ========================================
    // 3. ✨ 미소비 신호 조회 (NEW)
    // ========================================
    const signals = await getUnconsumedSignals({
      market,
      minConfidence: 0.7, // 최소 신뢰도 70%
    });

    if (signals.length === 0) {
      logger.info('미소비 신호 없음', { market });
      return;
    }

    logger.info('미소비 신호 발견', {
      market,
      count: signals.length,
    });

    // ========================================
    // 4. ✨ 각 신호에 대해 처리 (NEW)
    // ========================================
    let executedCount = 0;
    let rejectedCount = 0;
    let errorCount = 0;

    for (const signal of signals) {
      try {
        logger.info('신호 처리 시작', {
          signalId: signal.id,
          symbol: signal.symbol,
          signalType: signal.signal_type,
          confidence: signal.confidence,
        });

        // 4-1. ✨ 리스크 검증 (Phase 4)
        const riskValidation = await validateTradeRisk({
          symbol: signal.symbol,
          market: signal.market,
          broker: signal.broker,
          entry: new Big(signal.entry_price),
          stopLoss: new Big(signal.stop_loss),
          signalConfidence: signal.confidence,
        });

        if (!riskValidation.approved) {
          logger.warn('리스크 검증 실패 - 신호 거부', {
            signalId: signal.id,
            symbol: signal.symbol,
            violations: riskValidation.violations,
          });

          rejectedCount++;

          // 신호 소비 표시
          await markSignalConsumed(signal.id);
          continue;
        }

        logger.info('리스크 검증 통과', {
          signalId: signal.id,
          symbol: signal.symbol,
          positionSize: riskValidation.positionSize.toString(),
          positionValue: riskValidation.positionValue.toString(),
        });

        // 4-2. ✨ ACE 로그 생성 (Phase 5)
        const aceLogId = await logACEEntry({
          signal,
          riskValidation,
        });

        logger.info('ACE 로그 생성 완료', {
          signalId: signal.id,
          aceLogId,
        });

        // 4-3. ✨ 주문 실행 (Phase 7)
        const orderResult = await executeOrder(
          {
            symbol: signal.symbol,
            broker: signal.broker,
            market: signal.market,
            side: signal.signal_type as 'BUY' | 'SELL',
            qty: riskValidation.positionSize,
            price: new Big(signal.entry_price),
            orderType: 'market',
            dryRun: TRADING_CONFIG.dryRun,
            aceLogId,
          },
          clients
        );

        if (orderResult.success) {
          logger.info('주문 실행 성공', {
            signalId: signal.id,
            symbol: signal.symbol,
            tradeId: orderResult.tradeId,
            orderId: orderResult.orderId,
            executedPrice: orderResult.executedPrice,
            dryRun: orderResult.dryRun,
          });
          executedCount++;
        } else {
          logger.error('주문 실행 실패', {
            signalId: signal.id,
            symbol: signal.symbol,
            error: orderResult.error,
          });
          errorCount++;
        }

        // 4-4. ✨ 신호 소비 표시
        await markSignalConsumed(signal.id);

        logger.info('신호 처리 완료', {
          signalId: signal.id,
          symbol: signal.symbol,
          aceLogId,
        });
      } catch (error) {
        logger.error('신호 처리 중 에러', {
          signalId: signal.id,
          symbol: signal.symbol,
          error,
        });

        errorCount++;

        // 에러 발생 시에도 신호 소비 표시 (무한 재시도 방지)
        await markSignalConsumed(signal.id);
      }
    }

    logger.info('시장 루프 완료', {
      market,
      signals: signals.length,
      executed: executedCount,
      rejected: rejectedCount,
      error: errorCount,
      dryRun: TRADING_CONFIG.dryRun,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('시장 루프 실패', { market, error: msg });
  } finally {
    marketRunning.set(market, false);
  }
}

export async function mainLoop(): Promise<void> {
  if (!TRADING_CONFIG.enabled) {
    logger.warn('TRADE_EXECUTOR_ENABLED=false, 루프 실행 중단');
    return;
  }

  for (const market of EXECUTE_MARKETS) {
    await runMarketLoop(market);
  }
}

/**
 * ✨ 서킷 브레이커 주기적 체크 (Phase 4)
 *
 * 5분마다 서킷 브레이커 상태를 확인합니다.
 */
function startCircuitBreakerMonitoring(): void {
  logger.info('서킷 브레이커 모니터링 시작 (5분 간격)');

  // 즉시 한 번 실행
  checkCircuitBreaker().catch((error) => {
    logger.error('서킷 브레이커 체크 실패', { error });
  });

  // 5분마다 실행
  setInterval(() => {
    checkCircuitBreaker().catch((error) => {
      logger.error('서킷 브레이커 체크 실패', { error });
    });
  }, 5 * 60 * 1000);
}

async function startLoopMode(): Promise<void> {
  logger.info('루프 모드 시작', {
    markets: EXECUTE_MARKETS,
    dryRun: TRADING_CONFIG.dryRun,
  });

  // ✨ 서킷 브레이커 모니터링 시작 (Phase 4)
  startCircuitBreakerMonitoring();

  // ✨ Outcome 추적 시작 (Phase 5)
  startOutcomeTracking();

  // 시작 시 1회 즉시 실행
  await mainLoop();

  const timers = EXECUTE_MARKETS.map((market) => {
    const intervalMs = getMarketIntervalMs(market);
    logger.info('시장 루프 스케줄 등록', { market, intervalMs });

    return setInterval(() => {
      void runMarketLoop(market);
    }, intervalMs);
  });

  const shutdown = () => {
    logger.info('종료 시그널 수신, 루프 중지');
    for (const timer of timers) clearInterval(timer);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // 프로세스 유지
  while (true) {
    await sleep(1000);
  }
}

async function main(): Promise<void> {
  logger.info('🚀 trade-executor 시작 (Phase 6 - Full Integration)', {
    enabled: TRADING_CONFIG.enabled,
    dryRun: TRADING_CONFIG.dryRun,
    loopMode: TRADING_CONFIG.loopMode,
    executeMarkets: EXECUTE_MARKETS,
  });

  if (!TRADING_CONFIG.loopMode) {
    await mainLoop();
    return;
  }

  await startLoopMode();
}

main().catch((e: unknown) => {
  logger.error('trade-executor 치명적 오류', e);
  process.exit(1);
});
