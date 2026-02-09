import Big from 'big.js';
import { DateTime } from 'luxon';
import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import type { Broker } from '../config/markets.js';

export type TradeSide = 'BUY' | 'SELL';
export type TradeOrderType = 'MARKET' | 'LIMIT';
export type TradeExecutionStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

type BigInput = string | number | Big;

export type InsertTradeExecutionParams = {
  broker: Broker;
  symbol: string;
  side: TradeSide;
  orderType: TradeOrderType;
  quantity: BigInput;
  price?: BigInput | null;
  status?: TradeExecutionStatus;
  orderId?: string | null;
  decisionReason?: string | null;
  aiAnalysisId?: string | number | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
};

export type UpdateTradeExecutionParams = {
  id: string;
  status: TradeExecutionStatus;
  orderId?: string | null;
  executedQty?: BigInput | null;
  executedPrice?: BigInput | null;
  decisionReason?: string | null;
  metadata?: Record<string, unknown> | null;
  executedAt?: string | null;
};

export type UpdateDailyStatsParams = {
  side: TradeSide;
  quantity: BigInput;
  price: BigInput;
  success: boolean;
  dateKst?: string;
};

type TradeExecutionRow = {
  id?: unknown;
  metadata?: unknown;
};
let tradeExecutionHasIdempotencyColumn: boolean | null = null;

function toNumericString(value: BigInput): string {
  return new Big(value).toString();
}

function toNullableNumericString(value: BigInput | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return toNumericString(value);
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function mustIsoDate(value: DateTime): string {
  const isoDate = value.toISODate();
  if (!isoDate) throw new Error('ISO 날짜 변환 실패');
  return isoDate;
}

function toNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return Math.floor(parsed);
  }
  return 0;
}

function toBig(value: unknown): Big {
  if (value === null || value === undefined) return new Big(0);
  try {
    return new Big(value as BigInput);
  } catch {
    return new Big(0);
  }
}

function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  return value as Record<string, unknown>;
}

async function findExistingByIdempotency(params: InsertTradeExecutionParams): Promise<string | null> {
  if (!params.idempotencyKey) return null;

  const supabase = getSupabase();
  if (tradeExecutionHasIdempotencyColumn !== false) {
    const idQuery = await supabase
      .from('trade_executions')
      .select('id')
      .eq('idempotency_key', params.idempotencyKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!idQuery.error) {
      tradeExecutionHasIdempotencyColumn = true;
      const id = (idQuery.data as { id?: unknown } | null)?.id;
      if (typeof id === 'string' && id.length > 0) return id;
      return null;
    }

    if ((idQuery.error as { code?: string }).code !== '42703') {
      throw new Error(`trade_executions 중복 조회 실패: ${idQuery.error.message}`);
    }

    tradeExecutionHasIdempotencyColumn = false;
  }

  const { data, error } = await supabase
    .from('trade_executions')
    .select('id,metadata')
    .eq('broker', params.broker)
    .eq('symbol', params.symbol)
    .eq('side', params.side)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`trade_executions 중복 조회 실패: ${error.message}`);
  }

  const rows = (Array.isArray(data) ? data : []) as TradeExecutionRow[];
  for (const row of rows) {
    const metadata = toRecord(row.metadata);
    if (metadata?.idempotencyKey === params.idempotencyKey) {
      const id = row.id;
      if (typeof id === 'string' && id.length > 0) return id;
    }
  }

  return null;
}

/**
 * trade_executions에 주문 실행 기록을 생성한다.
 */
export async function insertTradeExecution(params: InsertTradeExecutionParams): Promise<string> {
  const existingId = await findExistingByIdempotency(params);
  if (existingId) return existingId;

  const supabase = getSupabase();
  const metadata = {
    ...(params.metadata ?? {}),
    idempotencyKey: params.idempotencyKey ?? null,
    aiAnalysisId: params.aiAnalysisId ?? null,
  };

  const payload: Record<string, unknown> = {
    service_name: 'trade-executor',
    broker: params.broker,
    symbol: params.symbol,
    side: params.side,
    order_type: params.orderType,
    quantity: toNumericString(params.quantity),
    price: toNullableNumericString(params.price),
    status: params.status ?? 'PENDING',
    order_id: toNullableString(params.orderId),
    decision_reason: toNullableString(params.decisionReason),
    metadata,
  };

  if (params.idempotencyKey) {
    payload.idempotency_key = params.idempotencyKey;
  }

  if (isUuid(params.aiAnalysisId)) {
    payload.ai_analysis_id = params.aiAnalysisId;
  }

  const { data, error } = await supabase
    .from('trade_executions')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    // insert race 상황에서 기존 레코드를 한번 더 조회
    const racedId = await findExistingByIdempotency(params);
    if (racedId) {
      return racedId;
    }

    throw new Error(`trade_executions insert 실패: ${error.message}`);
  }

  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('trade_executions insert 결과 id가 없습니다.');
  }

  return id;
}

/**
 * trade_executions 상태/체결 정보를 갱신한다.
 */
export async function updateTradeExecution(params: UpdateTradeExecutionParams): Promise<void> {
  const supabase = getSupabase();

  const payload: Record<string, unknown> = {
    status: params.status,
  };

  if (params.orderId !== undefined) payload.order_id = toNullableString(params.orderId);
  if (params.executedQty !== undefined)
    payload.executed_qty = toNullableNumericString(params.executedQty);
  if (params.executedPrice !== undefined)
    payload.executed_price = toNullableNumericString(params.executedPrice);
  if (params.decisionReason !== undefined)
    payload.decision_reason = toNullableString(params.decisionReason);
  if (params.metadata !== undefined) payload.metadata = params.metadata;

  if (params.status === 'SUCCESS') {
    payload.executed_at = params.executedAt ?? nowIso();
  } else if (params.executedAt !== undefined) {
    payload.executed_at = params.executedAt;
  }

  const { error } = await supabase.from('trade_executions').update(payload).eq('id', params.id);

  if (error) {
    throw new Error(`trade_executions update 실패: ${error.message}`);
  }
}

/**
 * 일일 거래 통계를 갱신한다.
 * - 1차: RPC increment_daily_stats 호출
 * - 2차: RPC 미존재/실패 시 테이블 직접 upsert
 */
export async function updateDailyStats(params: UpdateDailyStatsParams): Promise<void> {
  const supabase = getSupabase();

  const amount = new Big(params.quantity).times(params.price);
  const dateKst = params.dateKst ?? mustIsoDate(DateTime.now().setZone('Asia/Seoul'));

  const { error: rpcError } = await supabase.rpc('increment_daily_stats', {
    p_date: dateKst,
    p_side: params.side,
    p_amount: amount.toString(),
    p_success: params.success,
  });

  if (!rpcError) {
    return;
  }

  const { data, error: readError } = await supabase
    .from('daily_trading_stats')
    .select('date,total_trades,successful_trades,failed_trades,total_buy_amount,total_sell_amount')
    .eq('date', dateKst)
    .maybeSingle();

  if (readError) {
    throw new Error(`daily_trading_stats 조회 실패: ${readError.message}`);
  }

  const current = (data ?? {}) as Record<string, unknown>;
  const totalTrades = toNonNegativeInt(current.total_trades);
  const successfulTrades = toNonNegativeInt(current.successful_trades);
  const failedTrades = toNonNegativeInt(current.failed_trades);
  const totalBuyAmount = toBig(current.total_buy_amount);
  const totalSellAmount = toBig(current.total_sell_amount);

  const nextTotalTrades = totalTrades + 1;
  const nextSuccessfulTrades = successfulTrades + (params.success ? 1 : 0);
  const nextFailedTrades = failedTrades + (params.success ? 0 : 1);

  const nextBuy = params.side === 'BUY' ? totalBuyAmount.plus(amount) : totalBuyAmount;
  const nextSell = params.side === 'SELL' ? totalSellAmount.plus(amount) : totalSellAmount;

  const { error: upsertError } = await supabase.from('daily_trading_stats').upsert(
    {
      date: dateKst,
      total_trades: nextTotalTrades,
      successful_trades: nextSuccessfulTrades,
      failed_trades: nextFailedTrades,
      total_buy_amount: nextBuy.toString(),
      total_sell_amount: nextSell.toString(),
      updated_at: nowIso(),
    },
    { onConflict: 'date' },
  );

  if (upsertError) {
    throw new Error(`daily_trading_stats upsert 실패: ${upsertError.message}`);
  }
}
