import 'dotenv/config';
import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger, sleep } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';

import { EXECUTE_MARKETS, marketToBroker, type Market } from './config/markets.js';
import { TRADING_CONFIG } from './config/trading.js';

import { checkAllGuards } from './decision/guards.js';
import { pickCandidates } from './decision/candidates.js';
import { applyTradingRules } from './decision/rules.js';
import type { Position } from './decision/types.js';

import { getCurrentPrice, getLatestAIAnalysis, loadPositions } from './db/queries.js';
import { enqueueNotificationEvent } from './db/notifications.js';
import { executeOrders } from './execution/executor.js';
import { KISClient } from './brokers/kis/client.js';
import { UpbitClient } from './brokers/upbit/client.js';

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

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function isMarketOpen(market: Market): boolean {
  if (!TRADING_CONFIG.enableMarketHoursGuard) return true;
  if (TRADING_CONFIG.tradeExecutorRunMode === 'NO_CHECK') return true;
  if (market === 'CRYPTO') return true;

  if (market === 'KR') {
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

function toPositionRow(row: Record<string, unknown>): Position | null {
  const broker = row.broker;
  const market = row.market;
  const symbol = row.symbol;
  const qtyRaw = row.qty;
  const avgPriceRaw = row.avg_price;
  const updatedAt = row.updated_at;

  if (typeof broker !== 'string') return null;
  if (typeof market !== 'string') return null;
  if (typeof symbol !== 'string' || symbol.length === 0) return null;
  if (typeof updatedAt !== 'string') return null;

  const qty = asNumber(qtyRaw);
  if (qty === null) return null;

  let avgPrice: number | null = null;
  if (avgPriceRaw !== null && avgPriceRaw !== undefined) {
    const parsed = asNumber(avgPriceRaw);
    if (parsed !== null) avgPrice = parsed;
  }

  return {
    broker,
    market,
    symbol,
    qty,
    avgPrice,
    updatedAt,
  };
}

async function loadPositionsForMarket(market: Market): Promise<Position[]> {
  if (market === 'CRYPTO') {
    const rows = await loadPositions({ broker: 'UPBIT', limit: 1000 });

    return rows
      .map((r) => ({
        broker: r.broker,
        market: r.market,
        symbol: r.symbol,
        qty: r.qty,
        avgPrice: r.avg_price,
        updatedAt: r.updated_at,
      }))
      .filter((p) => {
        try {
          return new Big(p.qty).gt(0);
        } catch {
          return false;
        }
      });
  }

  const supabase = getSupabase();
  const broker = marketToBroker(market);

  const { data, error } = await supabase
    .from('positions')
    .select('broker,market,symbol,qty,avg_price,updated_at')
    .eq('broker', broker)
    .eq('market', market)
    .order('updated_at', { ascending: false })
    .limit(1000);

  if (error) {
    throw new Error(`positions 조회 실패(${market}): ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const out: Position[] = [];

  for (const raw of rows) {
    const parsed = toPositionRow(raw as Record<string, unknown>);
    if (!parsed) continue;

    try {
      if (new Big(parsed.qty).lte(0)) continue;
    } catch {
      continue;
    }

    out.push(parsed);
  }

  return out;
}

async function buildCurrentPriceMap(market: Market, symbols: string[]): Promise<Record<string, number>> {
  const broker = marketToBroker(market);
  const uniqueSymbols = Array.from(new Set(symbols));
  const out: Record<string, number> = {};

  for (const symbol of uniqueSymbols) {
    const px = await getCurrentPrice({ market, symbol });
    if (px === null) continue;

    out[`${broker}:${market}:${symbol}`] = px;
    out[`${broker}:${symbol}`] = px;
    out[symbol] = px;
  }

  return out;
}

async function runMarketLoop(market: Market): Promise<void> {
  if (marketRunning.get(market)) {
    logger.warn('시장 루프 중복 실행 스킵', { market });
    return;
  }

  marketRunning.set(market, true);

  try {
    if (!isMarketOpen(market)) {
      logger.info('장시간 외 시장 루프 스킵', { market });
      return;
    }

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

    const analyses = await getLatestAIAnalysis({
      market,
      limit: TRADING_CONFIG.maxCandidatesPerMarket,
      maxAgeMinutes: 180,
    });

    if (analyses.length === 0) {
      logger.info('최신 AI 분석 결과 없음', { market });
      return;
    }

    const positions = await loadPositionsForMarket(market);

    const candidates = pickCandidates({
      analyses,
      positions,
      limit: TRADING_CONFIG.maxCandidatesPerMarket,
    });

    const priceMap = await buildCurrentPriceMap(
      market,
      candidates.map((c) => c.symbol),
    );

    const decisions = applyTradingRules({
      candidates,
      currentPrices: priceMap,
      dryRun: TRADING_CONFIG.dryRun,
    });

    const executionResult = await executeOrders({
      decisions,
      clients,
      dryRun: TRADING_CONFIG.dryRun,
    });

    logger.info('시장 루프 완료', {
      market,
      analyses: analyses.length,
      candidates: candidates.length,
      decisions: decisions.length,
      executed: executionResult.attempted,
      success: executionResult.success,
      failed: executionResult.failed,
      skipped: executionResult.skipped,
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

async function startLoopMode(): Promise<void> {
  logger.info('루프 모드 시작', {
    markets: EXECUTE_MARKETS,
    dryRun: TRADING_CONFIG.dryRun,
  });

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
  logger.info('trade-executor 시작', {
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
