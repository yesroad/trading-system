import { createHash, randomUUID } from 'crypto';
import Big from 'big.js';
import jwt from 'jsonwebtoken';
import { DateTime } from 'luxon';
import {
  createLogger,
  env,
  envBoolean,
  envNumber,
  nowIso,
  requireEnv,
  sleep,
} from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';

const logger = createLogger('cost-reconciler');
const UPBIT_BASE_URL = 'https://api.upbit.com/v1';

type ReconcileTradeRow = {
  id?: string;
  broker?: string;
  market?: string;
  status?: string;
  order_id?: string | null;
  symbol?: string | null;
  fee_amount?: string | number | null;
  tax_amount?: string | number | null;
  metadata?: unknown;
};

type UpbitOrderDetail = {
  state?: 'wait' | 'watch' | 'done' | 'cancel';
  paid_fee?: string;
  trades?: Array<{
    fee?: string;
  }>;
};

type InsertError = {
  code?: string;
  message?: string;
};

type ReconcileUpdate = {
  feeAmount: string;
  taxAmount: string;
  source: 'BROKER' | 'UNAVAILABLE';
  provider: 'UPBIT' | 'KIS';
  reason?: string | null;
  orderState?: string | null;
};

const COST_RECONCILE_ENABLED = envBoolean('COST_RECONCILE_ENABLED', true);
const COST_RECONCILE_INTERVAL_SEC = envNumber('COST_RECONCILE_INTERVAL_SEC', 300) ?? 300;
const COST_RECONCILE_LOOKBACK_DAYS = envNumber('COST_RECONCILE_LOOKBACK_DAYS', 3) ?? 3;
const COST_RECONCILE_BATCH_SIZE = envNumber('COST_RECONCILE_BATCH_SIZE', 100) ?? 100;
const COST_RECONCILE_UPBIT_POLL_MAX = envNumber('COST_RECONCILE_UPBIT_POLL_MAX', 3) ?? 3;
const COST_RECONCILE_UPBIT_POLL_MS = envNumber('COST_RECONCILE_UPBIT_POLL_MS', 300) ?? 300;

const costReconcileRunning = { value: false };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toPositiveInt(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function isMissingCostColumnsError(error: InsertError | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return message.includes('fee_amount') || message.includes('tax_amount');
}

function parseAmount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    try {
      const parsed = new Big(value);
      return parsed.gte(0) ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      const parsed = new Big(value.trim());
      return parsed.gte(0) ? parsed.toString() : null;
    } catch {
      return null;
    }
  }

  return null;
}

function mergeMetadataCosts(metadata: unknown, update: ReconcileUpdate): Record<string, unknown> {
  const metadataRecord = asRecord(metadata) ?? {};
  const currentCosts = asRecord(metadataRecord.costs) ?? {};

  return {
    ...metadataRecord,
    costs: {
      ...currentCosts,
      feeAmount: update.feeAmount,
      taxAmount: update.taxAmount,
      source: update.source,
      provider: update.provider,
      reason: update.reason ?? null,
      orderState: update.orderState ?? null,
      reconciledAt: nowIso(),
    },
  };
}

function resolveCostSource(metadata: unknown): string | null {
  const metadataRecord = asRecord(metadata);
  if (!metadataRecord) return null;

  const costs = asRecord(metadataRecord.costs);
  if (!costs) return null;

  const source = costs.source;
  if (typeof source !== 'string') return null;
  return source;
}

function shouldReconcile(row: ReconcileTradeRow): boolean {
  if (row.status !== 'filled') return false;
  if (!row.order_id || row.order_id.trim().length === 0) return false;
  if (row.broker !== 'UPBIT' && row.broker !== 'KIS') return false;

  const source = resolveCostSource(row.metadata);
  if (source === 'BROKER') return false;
  if (row.broker === 'KIS' && source === 'UNAVAILABLE') return false;
  return true;
}

function isPaperKisEnv(): boolean {
  const kisEnv = (env('KIS_ENV') ?? 'REAL').toUpperCase();
  return kisEnv === 'PAPER' || kisEnv === 'MOCK' || kisEnv === 'SIM';
}

function createUpbitAuthToken(payloadParams: Record<string, string>): string {
  const accessKey = requireEnv('UPBIT_ACCESS_KEY');
  const secretKey = requireEnv('UPBIT_SECRET_KEY');

  const payload: Record<string, string> = {
    access_key: accessKey,
    nonce: randomUUID(),
  };

  if (Object.keys(payloadParams).length > 0) {
    const qs = new URLSearchParams(payloadParams).toString();
    const queryHash = createHash('sha512').update(qs, 'utf-8').digest('hex');
    payload.query_hash = queryHash;
    payload.query_hash_alg = 'SHA512';
  }

  return jwt.sign(payload, secretKey);
}

async function fetchUpbitOrderDetail(orderId: string): Promise<UpbitOrderDetail | null> {
  const params = { uuid: orderId };
  const token = createUpbitAuthToken(params);

  const res = await fetch(`${UPBIT_BASE_URL}/order?${new URLSearchParams(params).toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.warn('Upbit 주문 상세 조회 실패', {
      orderId,
      status: res.status,
      body: text.slice(0, 200),
    });
    return null;
  }

  try {
    return (await res.json()) as UpbitOrderDetail;
  } catch {
    logger.warn('Upbit 주문 상세 파싱 실패', { orderId });
    return null;
  }
}

async function fetchUpbitOrderDetailUntilFinal(orderId: string): Promise<UpbitOrderDetail | null> {
  const pollMax = toPositiveInt(COST_RECONCILE_UPBIT_POLL_MAX, 3);
  const pollMs = toPositiveInt(COST_RECONCILE_UPBIT_POLL_MS, 300);
  let latest: UpbitOrderDetail | null = null;

  for (let i = 0; i < pollMax; i += 1) {
    const detail = await fetchUpbitOrderDetail(orderId);
    if (detail) latest = detail;

    const state = detail?.state;
    if (state === 'done' || state === 'cancel') {
      return detail;
    }

    if (i < pollMax - 1) {
      await sleep(pollMs);
    }
  }

  return latest;
}

function resolveUpbitFee(detail: UpbitOrderDetail | null): string | null {
  if (!detail) return null;

  const directFee = parseAmount(detail.paid_fee);
  if (directFee !== null) {
    return directFee;
  }

  const trades = detail.trades;
  if (!Array.isArray(trades) || trades.length === 0) return null;

  let totalFee = new Big(0);
  let hasAnyFee = false;

  for (const trade of trades) {
    const fee = parseAmount(trade?.fee);
    if (fee === null) continue;
    hasAnyFee = true;
    totalFee = totalFee.plus(new Big(fee));
  }

  return hasAnyFee ? totalFee.toString() : null;
}

async function updateTradeCosts(row: ReconcileTradeRow, update: ReconcileUpdate): Promise<void> {
  const tradeId = row.id;
  if (!tradeId) return;

  const supabase = getSupabase();
  const metadata = mergeMetadataCosts(row.metadata, update);
  const payloadWithColumns = {
    fee_amount: update.feeAmount,
    tax_amount: update.taxAmount,
    metadata,
  };

  let { error } = await supabase.from('trades').update(payloadWithColumns).eq('id', tradeId);

  if (error && isMissingCostColumnsError(error)) {
    logger.warn('trades 수수료/세금 컬럼 없음 - metadata만 갱신', {
      tradeId,
      error: error.message,
    });

    const fallback = await supabase.from('trades').update({ metadata }).eq('id', tradeId);
    error = fallback.error;
  }

  if (error) {
    throw new Error(`거래 비용 업데이트 실패(${tradeId}): ${error.message}`);
  }
}

async function reconcileUpbitTrade(row: ReconcileTradeRow): Promise<'updated' | 'unavailable'> {
  const orderId = row.order_id;
  if (!orderId) return 'unavailable';

  const detail = await fetchUpbitOrderDetailUntilFinal(orderId);
  const feeAmount = resolveUpbitFee(detail);
  const currentTax = parseAmount(row.tax_amount) ?? '0';

  if (feeAmount === null) {
    await updateTradeCosts(row, {
      feeAmount: parseAmount(row.fee_amount) ?? '0',
      taxAmount: currentTax,
      source: 'UNAVAILABLE',
      provider: 'UPBIT',
      reason: 'UPBIT_ORDER_DETAIL_UNAVAILABLE',
      orderState: detail?.state ?? null,
    });
    return 'unavailable';
  }

  await updateTradeCosts(row, {
    feeAmount,
    taxAmount: '0',
    source: 'BROKER',
    provider: 'UPBIT',
    reason: null,
    orderState: detail?.state ?? null,
  });

  return 'updated';
}

async function reconcileKisTrade(row: ReconcileTradeRow): Promise<'updated' | 'unavailable'> {
  const reason = isPaperKisEnv()
    ? 'KIS_PAPER_COST_NOT_SUPPORTED'
    : 'KIS_ORDER_RESPONSE_HAS_NO_FEE_TAX';

  await updateTradeCosts(row, {
    feeAmount: parseAmount(row.fee_amount) ?? '0',
    taxAmount: parseAmount(row.tax_amount) ?? '0',
    source: 'UNAVAILABLE',
    provider: 'KIS',
    reason,
    orderState: null,
  });

  return 'unavailable';
}

async function loadCandidateTrades(): Promise<ReconcileTradeRow[]> {
  const supabase = getSupabase();
  const lookbackDays = toPositiveInt(COST_RECONCILE_LOOKBACK_DAYS, 3);
  const batchSize = toPositiveInt(COST_RECONCILE_BATCH_SIZE, 100);
  const fromIso = DateTime.now().minus({ days: lookbackDays }).toUTC().toISO();

  if (!fromIso) {
    return [];
  }

  const { data, error } = await supabase
    .from('trades')
    .select('id, broker, market, status, order_id, symbol, fee_amount, tax_amount, metadata, executed_at')
    .eq('status', 'filled')
    .not('order_id', 'is', null)
    .gte('executed_at', fromIso)
    .order('executed_at', { ascending: false })
    .limit(batchSize);

  if (error) {
    throw new Error(`비용 정산 대상 조회 실패: ${error.message}`);
  }

  return (data ?? []) as ReconcileTradeRow[];
}

export async function reconcileTradeCostsOnce(): Promise<void> {
  if (!COST_RECONCILE_ENABLED) return;
  if (costReconcileRunning.value) {
    logger.warn('비용 정산 중복 실행 스킵');
    return;
  }

  costReconcileRunning.value = true;

  try {
    const candidates = (await loadCandidateTrades()).filter(shouldReconcile);

    if (candidates.length === 0) {
      logger.debug('비용 정산 대상 없음');
      return;
    }

    let updated = 0;
    let unavailable = 0;
    let failed = 0;

    for (const row of candidates) {
      try {
        if (row.broker === 'UPBIT' && row.market === 'CRYPTO') {
          const result = await reconcileUpbitTrade(row);
          if (result === 'updated') updated += 1;
          else unavailable += 1;
          continue;
        }

        if (row.broker === 'KIS') {
          const result = await reconcileKisTrade(row);
          if (result === 'updated') updated += 1;
          else unavailable += 1;
          continue;
        }
      } catch (error) {
        failed += 1;
        logger.error('비용 정산 실패', {
          tradeId: row.id,
          broker: row.broker,
          orderId: row.order_id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info('비용 정산 실행 완료', {
      candidates: candidates.length,
      updated,
      unavailable,
      failed,
    });
  } finally {
    costReconcileRunning.value = false;
  }
}

export function startCostReconciliation(): void {
  if (!COST_RECONCILE_ENABLED) {
    logger.info('비용 정산 비활성화', { COST_RECONCILE_ENABLED });
    return;
  }

  const intervalSec = toPositiveInt(COST_RECONCILE_INTERVAL_SEC, 300);
  logger.info('비용 정산 모니터링 시작', {
    intervalSec,
    lookbackDays: toPositiveInt(COST_RECONCILE_LOOKBACK_DAYS, 3),
    batchSize: toPositiveInt(COST_RECONCILE_BATCH_SIZE, 100),
  });

  reconcileTradeCostsOnce().catch((error) => {
    logger.error('초기 비용 정산 실패', { error });
  });

  setInterval(() => {
    reconcileTradeCostsOnce().catch((error) => {
      logger.error('주기 비용 정산 실패', { error });
    });
  }, intervalSec * 1000);
}
