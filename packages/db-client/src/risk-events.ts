import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';
import type { RiskEvent, LogRiskEventParams } from './types.js';

/**
 * Log a risk event (circuit breaker, leverage violation, etc.)
 */
export async function logRiskEvent(params: LogRiskEventParams): Promise<void> {
  const supabase = getSupabase();

  const payload = {
    event_type: params.event_type,
    violation_type: params.violation_type ?? null,
    symbol: params.symbol ?? null,
    violation_details: params.violation_details,
    severity: params.severity,
    created_at: nowIso(),
  };

  const { error } = await supabase.from('risk_events').insert(payload);

  if (error) {
    throw new Error(`Failed to log risk event: ${error.message}`);
  }
}

/**
 * Get recent risk events
 * Optionally filter by event type and severity
 */
export async function getRecentRiskEvents(params?: {
  eventType?: RiskEvent['event_type'];
  severity?: RiskEvent['severity'];
  limit?: number;
}): Promise<RiskEvent[]> {
  const supabase = getSupabase();
  const limit = params?.limit ?? 50;

  let query = supabase
    .from('risk_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params?.eventType) {
    query = query.eq('event_type', params.eventType);
  }

  if (params?.severity) {
    query = query.eq('severity', params.severity);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch risk events: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Get circuit breaker events from today
 */
export async function getTodayCircuitBreakerEvents(): Promise<RiskEvent[]> {
  const supabase = getSupabase();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('risk_events')
    .select('*')
    .eq('event_type', 'circuit_breaker')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch circuit breaker events: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Count critical risk events in the last N hours
 */
export async function countCriticalEventsRecent(hours = 24): Promise<number> {
  const supabase = getSupabase();
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

  const { count, error } = await supabase
    .from('risk_events')
    .select('*', { count: 'exact', head: true })
    .eq('severity', 'critical')
    .gte('created_at', cutoff.toISOString());

  if (error) {
    throw new Error(`Failed to count critical events: ${error.message}`);
  }

  return count ?? 0;
}
