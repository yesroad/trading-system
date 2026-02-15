import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';
import type { ACELog, CreateACELogParams } from './types.js';

/**
 * Create an ACE log entry
 * @returns ACE log ID
 */
export async function createACELog(params: CreateACELogParams): Promise<string> {
  const supabase = getSupabase();

  const payload = {
    symbol: params.symbol,
    market: params.market,
    broker: params.broker,
    aspiration: params.aspiration,
    capability: params.capability,
    execution: params.execution,
    outcome: null,
    trade_id: params.trade_id ?? null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('ace_logs')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create ACE log: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Failed to get ACE log ID after insert');
  }

  return data.id;
}

/**
 * Update ACE log with outcome data (after trade closes)
 */
export async function updateACEOutcome(
  aceLogId: string,
  outcome: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('ace_logs')
    .update({
      outcome,
      updated_at: nowIso(),
    })
    .eq('id', aceLogId);

  if (error) {
    throw new Error(`Failed to update ACE outcome: ${error.message}`);
  }
}

/**
 * Get ACE logs by symbol
 */
export async function getACELogsBySymbol(
  symbol: string,
  limit = 20
): Promise<ACELog[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_logs')
    .select('*')
    .eq('symbol', symbol)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch ACE logs by symbol: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get ACE log by trade ID
 */
export async function getACELogByTradeId(tradeId: string): Promise<ACELog | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_logs')
    .select('*')
    .eq('trade_id', tradeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to fetch ACE log by trade ID: ${error.message}`);
  }

  return data;
}

/**
 * Get recent ACE logs with outcomes (for performance analysis)
 */
export async function getACELogsWithOutcomes(limit = 50): Promise<ACELog[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_logs')
    .select('*')
    .not('outcome', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch ACE logs with outcomes: ${error.message}`);
  }

  return data ?? [];
}
