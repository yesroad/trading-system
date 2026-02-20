import { createLogger } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';
import { logACEOutcome } from './ace-logger.js';

const logger = createLogger('outcome-tracker');

/**
 * 종료된 거래의 Outcome 추적
 *
 * 포지션이 청산된 거래를 찾아 ACE Outcome을 업데이트합니다.
 */
export async function trackCompletedTrades(): Promise<void> {
  logger.info('종료된 거래 Outcome 추적 시작');

  const supabase = getSupabase();

  try {
    // 1. ACE 로그가 있지만 Outcome이 없는 거래 조회
    const { data: aceLogs, error: aceError } = await supabase
      .from('ace_logs')
      .select('id, symbol, market, broker, execution, created_at')
      .is('outcome', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (aceError) {
      logger.error('ACE 로그 조회 실패', { error: aceError });
      return;
    }

    if (!aceLogs || aceLogs.length === 0) {
      logger.debug('Outcome 업데이트가 필요한 ACE 로그 없음');
      return;
    }

    logger.info(`Outcome 업데이트 대상 ACE 로그 발견`, { count: aceLogs.length });

    // 2. 각 ACE 로그에 대해 청산 거래 확인
    for (const aceLog of aceLogs) {
      try {
        const aceLogId = (aceLog as { id?: string }).id;
        const symbol = (aceLog as { symbol?: string }).symbol;
        const execution = (aceLog as { execution?: Record<string, unknown> }).execution;

        if (!aceLogId || !symbol || !execution) {
          logger.warn('ACE 로그 데이터 불완전', { aceLog });
          continue;
        }

        const tradeId = execution.tradeId as string | undefined;
        const entryTime = execution.timestamp as string;
        const entryPrice = execution.actualEntry as number;
        const size = execution.size as number;
        const side = execution.decision as 'BUY' | 'SELL';

        if (!tradeId || !entryTime || !entryPrice || !size || !side) {
          logger.warn('Execution 데이터 불완전', { aceLogId, execution });
          continue;
        }

        // 3. 해당 심볼의 청산 거래 조회 (진입 이후)
        const { data: exitTrades, error: tradesError } = await supabase
          .from('trades')
          .select('id, qty, price, executed_at')
          .eq('symbol', symbol)
          .eq('side', side === 'BUY' ? 'SELL' : 'BUY') // 반대 방향
          .eq('status', 'filled')
          .gte('executed_at', entryTime)
          .order('executed_at', { ascending: true })
          .limit(10);

        if (tradesError) {
          logger.error('청산 거래 조회 실패', { aceLogId, symbol, error: tradesError });
          continue;
        }

        if (!exitTrades || exitTrades.length === 0) {
          logger.debug('청산 거래 없음', { aceLogId, symbol });
          continue;
        }

        // 4. 첫 번째 청산 거래로 Outcome 업데이트
        const exitTrade = exitTrades[0];
        const exitPrice = exitTrade.price as number;
        const exitTime = exitTrade.executed_at as string;

        logger.info('청산 거래 발견 - Outcome 업데이트', {
          aceLogId,
          symbol,
          exitPrice,
        });

        await logACEOutcome({
          aceLogId,
          entryPrice,
          exitPrice,
          size,
          side,
          entryTime,
          exitTime,
          exitReason: 'auto_detected', // 자동 감지
        });
      } catch (error) {
        logger.error('Outcome 업데이트 중 에러', {
          aceLogId: (aceLog as { id?: string }).id,
          error,
        });
      }
    }

    logger.info('종료된 거래 Outcome 추적 완료');
  } catch (error) {
    logger.error('Outcome 추적 중 에러', { error });
  }
}

/**
 * 주기적 Outcome 추적 시작
 *
 * 5분마다 종료된 거래를 확인하여 Outcome을 업데이트합니다.
 *
 * @param intervalMs - 추적 주기 (밀리초, 기본 5분)
 */
export function startOutcomeTracking(intervalMs = 5 * 60 * 1000): void {
  logger.info('Outcome 주기적 추적 시작', {
    intervalMs,
    intervalMinutes: intervalMs / 60000,
  });

  // 즉시 한 번 실행
  trackCompletedTrades().catch((error) => {
    logger.error('초기 Outcome 추적 실패', { error });
  });

  // 주기적 실행
  setInterval(() => {
    trackCompletedTrades().catch((error) => {
      logger.error('Outcome 추적 실패', { error });
    });
  }, intervalMs);
}
