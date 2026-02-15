import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';
import type { NewsEvent, InsertNewsEventParams } from './types.js';

/**
 * Insert a news event
 * @returns news event ID
 */
export async function insertNewsEvent(
  params: InsertNewsEventParams
): Promise<string> {
  const supabase = getSupabase();

  const payload = {
    title: params.title,
    source: params.source ?? null,
    impact_score: params.impact_score,
    affected_symbols: params.affected_symbols ?? null,
    affected_sectors: params.affected_sectors ?? null,
    price_impact: params.price_impact ?? null,
    spread_range: params.spread_range ?? null,
    persistence_days: params.persistence_days ?? null,
    event_time: params.event_time,
    created_at: nowIso(),
  };

  const { data, error } = await supabase
    .from('news_events')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to insert news event: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('Failed to get news event ID after insert');
  }

  return data.id;
}

/**
 * Get recent high-impact news events
 */
export async function getHighImpactNews(params?: {
  minImpactScore?: number;
  limit?: number;
}): Promise<NewsEvent[]> {
  const supabase = getSupabase();
  const minScore = params?.minImpactScore ?? 7;
  const limit = params?.limit ?? 20;

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .gte('impact_score', minScore)
    .order('event_time', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch high-impact news: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get news events affecting a specific symbol
 */
export async function getNewsAffectingSymbol(
  symbol: string,
  limit = 10
): Promise<NewsEvent[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .contains('affected_symbols', [symbol])
    .order('event_time', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch news for symbol: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get recent news events (all)
 */
export async function getRecentNewsEvents(limit = 50): Promise<NewsEvent[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .order('event_time', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to fetch recent news events: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get news events in a time range
 */
export async function getNewsEventsRange(params: {
  startTime: string;
  endTime: string;
  minImpactScore?: number;
}): Promise<NewsEvent[]> {
  const supabase = getSupabase();

  let query = supabase
    .from('news_events')
    .select('*')
    .gte('event_time', params.startTime)
    .lte('event_time', params.endTime)
    .order('impact_score', { ascending: false });

  if (params.minImpactScore !== undefined) {
    query = query.gte('impact_score', params.minImpactScore);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch news events in range: ${error.message}`);
  }

  return data ?? [];
}
