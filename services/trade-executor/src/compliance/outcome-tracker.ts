import { createLogger } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';
import { logACEOutcome } from './ace-logger.js';

const logger = createLogger('outcome-tracker');

type AceLogRow = {
  id?: string;
  symbol?: string;
  execution?: unknown;
};

type TradeRow = {
  id?: string;
  symbol?: string;
  side?: string;
  qty?: string | number | null;
  price?: string | number | null;
  executed_at?: string | null;
  fee_amount?: string | number | null;
  tax_amount?: string | number | null;
  metadata?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeSide(value: unknown): 'BUY' | 'SELL' | null {
  const side = String(value ?? '')
    .trim()
    .toUpperCase();
  if (side === 'BUY' || side === 'SELL') return side;
  return null;
}

function readCostFromMetadata(metadata: unknown, key: 'feeAmount' | 'taxAmount'): number {
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) return 0;

  const costs = asRecord(metadataRecord.costs);
  if (!costs) return 0;

  return toNumber(costs[key]) ?? 0;
}

function resolveTradeCost(
  trade: TradeRow,
  column: 'fee_amount' | 'tax_amount',
  metadataKey: 'feeAmount' | 'taxAmount',
): number {
  const columnValue = toNumber(trade[column]);
  if (columnValue && columnValue > 0) {
    return columnValue;
  }
  return readCostFromMetadata(trade.metadata, metadataKey);
}

async function findEntryTrade(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  entryTime: string;
  tradeId?: string;
}): Promise<TradeRow | null> {
  const supabase = getSupabase();

  if (params.tradeId) {
    const { data: directTrade, error: directError } = await supabase
      .from('trades')
      .select('*')
      .eq('id', params.tradeId)
      .eq('status', 'filled')
      .maybeSingle();

    if (directError) {
      logger.warn('진입 거래 ID 조회 실패 - 시간기반 조회로 대체', {
        tradeId: params.tradeId,
        symbol: params.symbol,
        error: directError.message,
      });
    } else if (directTrade) {
      return directTrade as TradeRow;
    }
  }

  const { data: fallbackTrades, error: fallbackError } = await supabase
    .from('trades')
    .select('*')
    .eq('symbol', params.symbol)
    .eq('side', params.side)
    .eq('status', 'filled')
    .gte('executed_at', params.entryTime)
    .order('executed_at', { ascending: true })
    .limit(1);

  if (fallbackError) {
    logger.warn('진입 거래 시간기반 조회 실패', {
      symbol: params.symbol,
      entryTime: params.entryTime,
      error: fallbackError.message,
    });
    return null;
  }

  if (!fallbackTrades || fallbackTrades.length === 0) {
    return null;
  }

  return fallbackTrades[0] as TradeRow;
}

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
        const row = aceLog as AceLogRow;
        const aceLogId = row.id;
        const symbol = row.symbol;
        const execution = asRecord(row.execution);

        if (!aceLogId || !symbol || !execution) {
          logger.warn('ACE 로그 데이터 불완전', { aceLog });
          continue;
        }

        const tradeId = typeof execution.tradeId === 'string' ? execution.tradeId : undefined;
        const entryTimeFromExecution =
          typeof execution.timestamp === 'string' ? execution.timestamp : null;
        const entryPriceFromExecution = toNumber(execution.actualEntry);
        const sizeFromExecution = toNumber(execution.size);
        const side = normalizeSide(execution.decision);

        if (!entryTimeFromExecution || !entryPriceFromExecution || !sizeFromExecution || !side) {
          logger.warn('Execution 데이터 불완전', { aceLogId, execution });
          continue;
        }

        const entryTrade = await findEntryTrade({
          symbol,
          side,
          entryTime: entryTimeFromExecution,
          tradeId,
        });

        const entryPrice = toNumber(entryTrade?.price) ?? entryPriceFromExecution;
        const size = toNumber(entryTrade?.qty) ?? sizeFromExecution;
        const entryTime =
          typeof entryTrade?.executed_at === 'string' && entryTrade.executed_at.length > 0
            ? entryTrade.executed_at
            : entryTimeFromExecution;

        if (!entryPrice || !size || !entryTime) {
          logger.warn('진입 거래 데이터 불완전', {
            aceLogId,
            symbol,
            tradeId,
          });
          continue;
        }

        const entryFee = entryTrade ? resolveTradeCost(entryTrade, 'fee_amount', 'feeAmount') : 0;
        const entryTax = entryTrade ? resolveTradeCost(entryTrade, 'tax_amount', 'taxAmount') : 0;

        // 3. 해당 심볼의 청산 거래 조회 (진입 이후)
        const { data: exitTrades, error: tradesError } = await supabase
          .from('trades')
          .select('*')
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
        const exitTrade = exitTrades[0] as TradeRow;
        const exitPrice = toNumber(exitTrade.price);
        const exitTime = exitTrade.executed_at ?? null;

        if (!exitPrice || !exitTime) {
          logger.warn('청산 거래 데이터 불완전', {
            aceLogId,
            symbol,
            exitTrade,
          });
          continue;
        }

        const exitFee = resolveTradeCost(exitTrade, 'fee_amount', 'feeAmount');
        const exitTax = resolveTradeCost(exitTrade, 'tax_amount', 'taxAmount');

        logger.info('청산 거래 발견 - Outcome 업데이트', {
          aceLogId,
          symbol,
          exitPrice,
          entryFee,
          entryTax,
          exitFee,
          exitTax,
        });

        await logACEOutcome({
          aceLogId,
          entryPrice,
          exitPrice,
          size,
          side,
          entryTime,
          exitTime,
          entryFee,
          entryTax,
          exitFee,
          exitTax,
          exitReason: 'auto_detected', // 자동 감지
        });
      } catch (error) {
        const row = aceLog as AceLogRow;
        logger.error('Outcome 업데이트 중 에러', { aceLogId: row.id, error });
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
