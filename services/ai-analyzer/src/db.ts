import { supabase } from './supabase';
import type { AiFilterDecision, EquityBar, Market } from './types/ai';
import type { JsonValue } from './types/json';
import type { Nullable } from './types/utils';

type EquityBarRow = {
  ts: string | number | Date;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume?: string | number | null;
};

/**
 * equity_bars에서 최근 구간 바 데이터를 가져온다.
 * - 현재 너의 equity_bars는 US 전용이라 market 컬럼이 없으므로 market 필터를 걸지 않는다.
 * - 나중에 US/KR/CRYPTO 통합 시점에 equity_bars에 market 컬럼을 추가하면 그때 다시 붙이면 됨.
 */
export async function fetchRecentBars(params: {
  market: Market; // 현재는 필터에 쓰지 않음(호환성 유지를 위해 파라미터는 남김)
  symbol: string;
  timeframe: string;
  window_start: string;
  window_end: string;
}): Promise<EquityBar[]> {
  const { data, error } = await supabase
    .from('equity_bars')
    .select('ts, open, high, low, close, volume')
    .eq('symbol', params.symbol)
    .eq('timeframe', params.timeframe)
    .gte('ts', params.window_start)
    .lte('ts', params.window_end)
    .order('ts', { ascending: true });

  if (error) {
    console.error('[ai-analyzer] equity_bars 조회 실패', error);
    throw new Error(String(error.message ?? error));
  }

  const rows = (data ?? []) as EquityBarRow[];
  return rows.map((r) => ({
    ts: String(r.ts),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: r.volume == null ? null : Number(r.volume),
  }));
}

export async function insertAnalysisRun(params: {
  market: Market;
  symbol: string;
  input_hash: string;
  window_start: string;
  window_end: string;
  status: 'success' | 'failed' | 'skipped';
  skip_reason?: Nullable<string>;
  error_message?: Nullable<string>;
  latency_ms?: Nullable<number>;
  model?: Nullable<string>;
  prompt_tokens?: Nullable<number>;
  completion_tokens?: Nullable<number>;
  total_tokens?: Nullable<number>;
}) {
  const { error } = await supabase.from('analysis_runs').insert({
    service: 'ai-analyzer',
    market: params.market,
    symbol: params.symbol,
    input_hash: params.input_hash,
    window_start: params.window_start,
    window_end: params.window_end,
    status: params.status,
    skip_reason: params.skip_reason ?? null,
    error_message: params.error_message ?? null,
    latency_ms: params.latency_ms ?? null,
    model: params.model ?? null,
    prompt_tokens: params.prompt_tokens ?? null,
    completion_tokens: params.completion_tokens ?? null,
    total_tokens: params.total_tokens ?? null,
  });

  if (error) {
    console.error('[ai-analyzer] analysis_runs 기록 실패', error);
  }
}

export async function upsertAiResult(params: {
  market: Market;
  symbol: string;
  timeframe: string;
  window_start: string;
  window_end: string;
  input_hash: string;
  result: AiFilterDecision;
}) {
  const { error } = await supabase.from('ai_analysis_results').upsert(
    {
      market: params.market,
      symbol: params.symbol,
      timeframe: params.timeframe,
      window_start: params.window_start,
      window_end: params.window_end,
      input_hash: params.input_hash,

      decision: params.result.decision,
      confidence: params.result.confidence,
      reason: params.result.reason,
      tags: params.result.tags ?? [],
      raw: (params.result.raw ?? null) as JsonValue | null,
    },
    { onConflict: 'market,symbol,window_end,input_hash' },
  );

  if (error) {
    console.error('[ai-analyzer] ai_analysis_results upsert 실패', error);
  }
}

/**
 * 중복 방지: 같은 window_end + input_hash면 다시 저장하지 않는다.
 * - ai_analysis_results는 market 컬럼이 있으므로 중복체크는 symbol/window_end/input_hash로 충분.
 */
export async function hasAiResult(params: {
  market: Market; // 현재는 필터에 쓰지 않음(호환성 유지)
  symbol: string;
  window_end: string;
  input_hash: string;
}) {
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('id')
    .eq('symbol', params.symbol)
    .eq('window_end', params.window_end)
    .eq('input_hash', params.input_hash)
    .limit(1);

  if (error) {
    console.error('[ai-analyzer] ai_analysis_results 중복 체크 실패', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}
