import type { Market, OhlcSummary } from './types/ai.js';
import { supabase } from './supabase.js';

export type CandidateDecision =
  | { isCandidate: true; score: number; reason: string }
  | { isCandidate: false; score: number; reason: string };

/**
 * 후보 조건(필터 호출 트리거)
 * - 너무 엄격하면 AI가 거의 안 돈다 → 초반엔 약하게
 * - 너무 약하면 비용이 늘어난다 → 목표는 "호출 최소화"
 *
 * 기본 정책(가벼움):
 * - range_pct(고저 범위)가 너무 크면: 노이즈/급변 → 후보(리스크 감지)로 AI에 판단 맡김
 * - return_pct(수익률)이 일정 이상이면: 추세 발생 → 후보
 * - mean_abs_return_pct(평균 절대수익률)가 높으면: 변동성 증가 → 후보
 */
export function decideCandidate(ohlc: OhlcSummary): CandidateDecision {
  // 조절 파라미터(초반은 약하게 시작)
  const RANGE_PCT_TRIGGER = 1.2; // 240분 동안 고저 범위 1.2% 이상
  const RETURN_PCT_TRIGGER = 0.6; // 240분 수익률 0.6% 이상(상승/하락 모두)
  const MEAN_ABS_RET_TRIGGER = 0.08; // 분당 평균 절대수익률(%)

  let score = 0;
  const reasons: string[] = [];

  if (ohlc.range_pct >= RANGE_PCT_TRIGGER) {
    score += Math.min(3, ohlc.range_pct / RANGE_PCT_TRIGGER);
    reasons.push(`range ${ohlc.range_pct.toFixed(2)}%`);
  }

  if (Math.abs(ohlc.return_pct) >= RETURN_PCT_TRIGGER) {
    score += Math.min(3, Math.abs(ohlc.return_pct) / RETURN_PCT_TRIGGER);
    reasons.push(`return ${ohlc.return_pct.toFixed(2)}%`);
  }

  if (ohlc.mean_abs_return_pct >= MEAN_ABS_RET_TRIGGER) {
    score += Math.min(3, ohlc.mean_abs_return_pct / MEAN_ABS_RET_TRIGGER);
    reasons.push(`vol ${ohlc.mean_abs_return_pct.toFixed(3)}%`);
  }

  const isCandidate = score >= 1; // 초반은 1만 넘어도 후보로 둠(너무 안 도는 것 방지)

  return {
    isCandidate,
    score: Number(score.toFixed(2)),
    reason: reasons.length ? reasons.join(', ') : 'no signal',
  };
}

export async function upsertCandidate(params: {
  market: Market;
  symbol: string;
  timeframe: string;
  window_end: string;
  score: number;
  reason: string;
}) {
  const { error } = await supabase.from('analysis_candidates').upsert(
    {
      market: params.market,
      symbol: params.symbol,
      timeframe: params.timeframe,
      window_end: params.window_end,
      score: params.score,
      reason: params.reason,
    },
    { onConflict: 'market,symbol,window_end' },
  );

  if (error) {
    console.error('[ai-analyzer] analysis_candidates upsert 실패', error);
  }
}

export async function loadCandidates(params: { market: Market; window_end: string }) {
  const { data, error } = await supabase
    .from('analysis_candidates')
    .select('symbol, timeframe, score, reason')
    .eq('market', params.market)
    .eq('window_end', params.window_end)
    .order('score', { ascending: false });

  if (error) {
    console.error('[ai-analyzer] analysis_candidates 조회 실패', error);
    return [];
  }

  return data ?? [];
}
