import { supabase } from './supabase.js';
import { nowIso, toIsoString, type Nullable } from '@workspace/shared-utils';
import { DateTime } from 'luxon';

export async function fetchRecentIngestionRuns(limit: number) {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select(
      'id,job,symbols,timeframe,started_at,finished_at,status,inserted_count,updated_count,error_message',
    )
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`ingestion_runs 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function fetchLatestAiResultsByMarket(markets: Array<'KR' | 'KRX' | 'US' | 'CRYPTO'>) {
  // 시장별 최신 created_at 하나만 가져오기 위해 “group by + max” 대신
  // 간단히 RPC나 view 없이도 동작하는 방식으로: markets를 돌면서 1개씩 가져옴 (시장 3개면 충분히 가벼움)
  const out: Array<{ market: string; latest_created_at: Nullable<string> }> = [];

  for (const m of markets) {
    const queryMarkets = m === 'KR' ? ['KR', 'KRX'] : [m];

    const { data, error } = await supabase
      .from('ai_analysis_results')
      .select('created_at')
      .in('market', queryMarkets)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`ai_analysis_results 조회 실패(${m}): ${error.message}`);

    out.push({
      market: m === 'KRX' ? 'KR' : m,
      latest_created_at:
        Array.isArray(data) && data[0]?.created_at ? String(data[0].created_at) : null,
    });
  }

  return out;
}

export async function fetchLatestWorkers() {
  const { data, error } = await supabase
    .from('worker_status')
    .select('service,state,run_mode,last_event_at,last_success_at,message')
    .order('service', { ascending: true });

  if (error) throw new Error(`worker_status 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function fetchLatestIngestionSuccessByJobs(jobs: string[]) {
  const out: Array<{ job: string; latest_success_at: Nullable<string> }> = [];

  for (const job of jobs) {
    const { data, error } = await supabase
      .from('ingestion_runs')
      .select('started_at,status')
      .eq('job', job)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`ingestion_runs latest success 조회 실패(${job}): ${error.message}`);

    out.push({
      job,
      latest_success_at:
        Array.isArray(data) && data[0]?.started_at ? String(data[0].started_at) : null,
    });
  }

  return out;
}

export type SymbolCatalogRow = {
  market: string;
  symbol: string;
  name_ko: Nullable<string>;
  name_en: Nullable<string>;
};

export async function fetchSymbolCatalogRows(
  pairs: Array<{ market: string; symbol: string }>,
): Promise<SymbolCatalogRow[]> {
  if (pairs.length === 0) return [];

  const cryptoQuotePrefixes = ['KRW-', 'USDT-', 'USD-', 'BTC-', 'ETH-'] as const;
  const marketSet = new Set<string>();
  const symbolSet = new Set<string>();

  for (const pair of pairs) {
    const market = String(pair.market ?? '')
      .trim()
      .toUpperCase();
    const symbol = String(pair.symbol ?? '').trim();
    if (!market || !symbol) continue;

    marketSet.add(market);
    symbolSet.add(symbol);

    // 접두어가 섞인 데이터를 대비한 보조 키
    if (market === 'KRX') {
      if (symbol.startsWith('KRX:')) symbolSet.add(symbol.slice(4));
      else symbolSet.add(`KRX:${symbol}`);
    }
    if (market === 'US') {
      if (symbol.startsWith('US:')) symbolSet.add(symbol.slice(3));
      else symbolSet.add(`US:${symbol}`);
    }
    if (market === 'CRYPTO') {
      const normalized = symbol.toUpperCase();
      const dashIndex = normalized.indexOf('-');

      if (dashIndex > 0 && dashIndex < normalized.length - 1) {
        const base = normalized.slice(dashIndex + 1);
        symbolSet.add(base);
      } else {
        for (const prefix of cryptoQuotePrefixes) {
          symbolSet.add(`${prefix}${normalized}`);
        }
      }
    }
  }

  const markets = [...marketSet];
  const symbols = [...symbolSet];
  if (markets.length === 0 || symbols.length === 0) return [];

  const { data, error } = await supabase
    .from('symbol_catalog')
    .select('market,symbol,name_ko,name_en')
    .in('market', markets)
    .in('symbol', symbols);

  if (error) throw new Error(`symbol_catalog 조회 실패: ${error.message}`);
  return (data ?? []) as SymbolCatalogRow[];
}

export type TradeRow = {
  id: string;
  symbol: string;
  market: string;
  side: string;
  status: string;
  qty: Nullable<string | number>;
  price: Nullable<string | number>;
  executed_at: Nullable<string>;
  created_at: string;
  fee_amount?: Nullable<string | number>;
  tax_amount?: Nullable<string | number>;
  metadata?: unknown;
};

export async function fetchTradesInRange(params: {
  fromIso: string;
  toIso: string;
  status?: string;
}): Promise<TradeRow[]> {
  let query = supabase
    .from('trades')
    .select(
      'id,symbol,market,side,status,qty,price,executed_at,created_at,fee_amount,tax_amount,metadata',
    )
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso)
    .order('created_at', { ascending: true });

  if (params.status) {
    query = query.eq('status', params.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`trades 조회 실패: ${error.message}`);
  return (data ?? []) as TradeRow[];
}

export async function fetchSignalCountsInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<{ buySellCount: number; totalCount: number }> {
  const [{ count: totalCount, error: totalError }, { count: buySellCount, error: buySellError }] =
    await Promise.all([
      supabase
        .from('trading_signals')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', params.fromIso)
        .lte('created_at', params.toIso),
      supabase
        .from('trading_signals')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', params.fromIso)
        .lte('created_at', params.toIso)
        .in('signal_type', ['BUY', 'SELL']),
    ]);

  if (totalError) throw new Error(`trading_signals(total) 조회 실패: ${totalError.message}`);
  if (buySellError) throw new Error(`trading_signals(BUY/SELL) 조회 실패: ${buySellError.message}`);

  return {
    totalCount: totalCount ?? 0,
    buySellCount: buySellCount ?? 0,
  };
}

export type AceOutcomeRow = {
  symbol: string;
  market: string;
  updated_at: string;
  outcome: unknown;
};

export async function fetchAceOutcomesInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<AceOutcomeRow[]> {
  const { data, error } = await supabase
    .from('ace_logs')
    .select('symbol,market,updated_at,outcome')
    .not('outcome', 'is', null)
    .gte('updated_at', params.fromIso)
    .lte('updated_at', params.toIso)
    .order('updated_at', { ascending: true });

  if (error) throw new Error(`ace_logs(outcome) 조회 실패: ${error.message}`);
  return (data ?? []) as AceOutcomeRow[];
}

export type SignalFailureReasonRow = {
  failure_type: string;
  failure_reason: string;
};

export async function fetchSignalFailureReasonsInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<SignalFailureReasonRow[]> {
  const { data, error } = await supabase
    .from('signal_generation_failures')
    .select('failure_type,failure_reason')
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso)
    .order('created_at', { ascending: false })
    .limit(300);

  if (error) throw new Error(`signal_generation_failures 조회 실패: ${error.message}`);
  return (data ?? []) as SignalFailureReasonRow[];
}

export async function fetchAiDecisionCountsInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<{ buySellCount: number; totalCount: number }> {
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('decision')
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso);

  if (error) throw new Error(`ai_analysis_results 조회 실패: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  let buySell = 0;
  for (const row of rows) {
    const decision = String((row as { decision?: unknown }).decision ?? '')
      .trim()
      .toUpperCase();
    if (decision === 'BUY' || decision === 'SELL') buySell += 1;
  }

  return {
    totalCount: rows.length,
    buySellCount: buySell,
  };
}

export type AiUsageBySymbolRow = {
  market: string;
  symbol: string;
  usageCount: number;
};

export async function fetchAiUsageBySymbolInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<AiUsageBySymbolRow[]> {
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('market,symbol')
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso);

  if (error) throw new Error(`ai_analysis_results(종목별 사용량) 조회 실패: ${error.message}`);

  const rows = Array.isArray(data) ? data : [];
  const aggregated = new Map<string, AiUsageBySymbolRow>();

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const market = String(record.market ?? '')
      .trim()
      .toUpperCase();
    const symbol = String(record.symbol ?? '').trim();
    if (!market || !symbol) continue;

    const key = `${market}:${symbol}`;
    const found = aggregated.get(key);
    if (found) {
      found.usageCount += 1;
      continue;
    }

    aggregated.set(key, {
      market,
      symbol,
      usageCount: 1,
    });
  }

  return [...aggregated.values()].sort((a, b) => {
    if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
    if (a.market !== b.market) return a.market.localeCompare(b.market);
    return a.symbol.localeCompare(b.symbol);
  });
}

export async function fetchSystemGuardTradingEnabled(): Promise<Nullable<boolean>> {
  const { data, error } = await supabase
    .from('system_guard')
    .select('trading_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw new Error(`system_guard 조회 실패: ${error.message}`);
  if (!data) return null;
  return (data as { trading_enabled?: unknown }).trading_enabled === true;
}

export type WorkerStatusSummary = {
  service: string;
  state: string;
  run_mode: Nullable<string>;
  last_event_at: Nullable<string>;
  last_success_at: Nullable<string>;
};

export async function fetchWorkerStatusByService(
  service: string,
): Promise<Nullable<WorkerStatusSummary>> {
  const { data, error } = await supabase
    .from('worker_status')
    .select('service,state,run_mode,last_event_at,last_success_at')
    .eq('service', service)
    .maybeSingle();

  if (error) throw new Error(`worker_status(${service}) 조회 실패: ${error.message}`);
  return (data ?? null) as Nullable<WorkerStatusSummary>;
}

export async function fetchCircuitBreakerCountInRange(params: {
  fromIso: string;
  toIso: string;
}): Promise<number> {
  const { count, error } = await supabase
    .from('risk_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', params.fromIso)
    .lte('created_at', params.toIso)
    .in('event_type', ['circuit_breaker', 'circuit_breaker_triggered']);

  if (error) throw new Error(`risk_events 조회 실패: ${error.message}`);
  return count ?? 0;
}

export function buildPreviousKstDayWindow(now: DateTime = DateTime.now()): {
  fromIso: string;
  toIso: string;
  dateLabel: string;
  rangeLabel: string;
  dayIsoDate: string;
} {
  const kst = now.setZone('Asia/Seoul');
  const dayStart = kst.minus({ days: 1 }).startOf('day');
  const dayEnd = dayStart.endOf('day');

  const fromIso = toIsoString(dayStart.toUTC());
  const toIso = toIsoString(dayEnd.toUTC());

  return {
    fromIso,
    toIso,
    dateLabel: dayStart.toFormat('yy.MM.dd'),
    rangeLabel: `${dayStart.toFormat('yy.MM.dd HH:mm')} ~ ${dayEnd.toFormat('yy.MM.dd HH:mm')} (KST)`,
    dayIsoDate: dayStart.toFormat('yyyy-MM-dd'),
  };
}

export type NotificationEventRow = {
  id: number;
  source_service: string;
  event_type: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | string;
  market: Nullable<string>;
  title: string;
  message: string;
  payload: unknown;
  status: 'PENDING' | 'SENT' | 'FAILED' | string;
  created_at: string;
};

export async function fetchPendingNotificationEvents(
  limit: number,
): Promise<NotificationEventRow[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));

  const { data, error } = await supabase
    .from('notification_events')
    .select('id,source_service,event_type,level,market,title,message,payload,status,created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true })
    .limit(safeLimit);

  if (error) throw new Error(`notification_events 조회 실패: ${error.message}`);
  return (data ?? []) as NotificationEventRow[];
}

export async function markNotificationEventSent(id: number): Promise<void> {
  const { error } = await supabase
    .from('notification_events')
    .update({
      status: 'SENT',
      sent_at: nowIso(),
      error_message: null,
    })
    .eq('id', id);

  if (error) throw new Error(`notification_events SENT 업데이트 실패: ${error.message}`);
}

export async function markNotificationEventFailed(id: number, message: string): Promise<void> {
  const { error } = await supabase
    .from('notification_events')
    .update({
      status: 'FAILED',
      error_message: message.slice(0, 500),
    })
    .eq('id', id);

  if (error) throw new Error(`notification_events FAILED 업데이트 실패: ${error.message}`);
}
