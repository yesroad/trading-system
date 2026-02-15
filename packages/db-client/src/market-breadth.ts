import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';
import type { MarketBreadth, UpsertMarketBreadthParams } from './types.js';

/**
 * Upsert market breadth data
 * Uses (market, analysis_time) as conflict key
 */
export async function upsertMarketBreadth(
  params: UpsertMarketBreadthParams
): Promise<void> {
  const supabase = getSupabase();

  const payload = {
    market: params.market,
    breadth_index: params.breadth_index,
    uptrend_ratio: params.uptrend_ratio,
    advance_decline_line: params.advance_decline_line ?? null,
    mcclellan_oscillator: params.mcclellan_oscillator ?? null,
    analysis_time: params.analysis_time,
    created_at: nowIso(),
  };

  const { error } = await supabase
    .from('market_breadth')
    .upsert(payload, { onConflict: 'market,analysis_time' });

  if (error) {
    throw new Error(`Failed to upsert market breadth: ${error.message}`);
  }
}

/**
 * Get latest market breadth for a specific market
 */
export async function getLatestMarketBreadth(
  market: 'KRX' | 'US'
): Promise<MarketBreadth | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('market_breadth')
    .select('*')
    .eq('market', market)
    .order('analysis_time', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    throw new Error(`Failed to fetch latest market breadth: ${error.message}`);
  }

  return data;
}

/**
 * Get market breadth history for a specific market
 */
export async function getMarketBreadthHistory(
  market: 'KRX' | 'US',
  limit = 30
): Promise<MarketBreadth[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('market_breadth')
    .select('*')
    .eq('market', market)
    .order('analysis_time', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch market breadth history: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get market breadth for a specific time range
 */
export async function getMarketBreadthRange(params: {
  market: 'KRX' | 'US';
  startTime: string;
  endTime: string;
}): Promise<MarketBreadth[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('market_breadth')
    .select('*')
    .eq('market', params.market)
    .gte('analysis_time', params.startTime)
    .lte('analysis_time', params.endTime)
    .order('analysis_time', { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch market breadth range: ${error.message}`);
  }

  return data ?? [];
}
