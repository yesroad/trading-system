import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';
import type { TradingSignal, InsertTradingSignalParams } from './types.js';

/**
 * Insert a new trading signal
 * @returns signal ID
 */
export async function insertTradingSignal(
  params: InsertTradingSignalParams
): Promise<string> {
  const supabase = getSupabase();

  const payload = {
    symbol: params.symbol,
    market: params.market,
    broker: params.broker,
    signal_type: params.signal_type,
    entry_price: params.entry_price,
    target_price: params.target_price,
    stop_loss: params.stop_loss,
    confidence: params.confidence,
    reason: params.reason ?? null,
    indicators: params.indicators ?? null,
    ai_analysis_id: params.ai_analysis_id ?? null,
    created_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('trading_signals')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to insert trading signal: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Failed to get signal ID after insert');
  }

  return data.id;
}

/**
 * Get unconsumed signals (consumed_at IS NULL)
 * Optionally filter by market and minimum confidence
 */
export async function getUnconsumedSignals(params?: {
  market?: 'KRW' | 'KRX' | 'US';
  minConfidence?: number;
}): Promise<TradingSignal[]> {
  const supabase = getSupabase();

  let query = supabase
    .from('trading_signals')
    .select('*')
    .is('consumed_at', null)
    .order('created_at', { ascending: false });

  if (params?.market) {
    query = query.eq('market', params.market);
  }

  if (params?.minConfidence !== undefined) {
    query = query.gte('confidence', params.minConfidence);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch unconsumed signals: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Mark a signal as consumed
 */
export async function markSignalConsumed(signalId: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('trading_signals')
    .update({ consumed_at: nowIso() })
    .eq('id', signalId);

  if (error) {
    throw new Error(`Failed to mark signal as consumed: ${error.message}`);
  }
}

/**
 * Get recent signals by symbol (for analysis)
 */
export async function getSignalsBySymbol(
  symbol: string,
  limit = 10
): Promise<TradingSignal[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('trading_signals')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch signals by symbol: ${error.message}`);
  }

  return data ?? [];
}
