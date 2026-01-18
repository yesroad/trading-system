import type { EquityBar, OhlcSummary } from "../types/ai.js";

/**
 * OHLC 시계열에서 아주 가벼운 요약/지표만 만든다.
 * - 비용(토큰)을 줄이기 위해 "전체 bars"를 그대로 LLM에 던지지 않는다.
 */
export function summarizeBars(bars: EquityBar[]): OhlcSummary {
  if (bars.length < 2) {
    const only = bars[0];
    const p = only?.close ?? 0;
    return {
      count: bars.length,
      start: p,
      end: p,
      return_pct: 0,
      high: p,
      low: p,
      range_pct: 0,
      mean_abs_return_pct: 0,
      slope_per_min_pct: 0,
      last_close: p,
    };
  }

  const start = bars[0].close;
  const end = bars[bars.length - 1].close;

  let high = -Infinity;
  let low = Infinity;

  for (const b of bars) {
    if (b.high > high) high = b.high;
    if (b.low < low) low = b.low;
  }

  const return_pct = pctChange(start, end);
  const range_pct = start > 0 ? ((high - low) / start) * 100 : 0;

  // 평균 절대 수익률(%) (간단 변동성)
  let absRetSum = 0;
  let absRetN = 0;
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    const cur = bars[i].close;
    if (prev > 0) {
      absRetSum += Math.abs(((cur - prev) / prev) * 100);
      absRetN++;
    }
  }
  const mean_abs_return_pct = absRetN ? absRetSum / absRetN : 0;

  // 단순 선형 추세: (끝-시작) / 분수
  const minutes = Math.max(1, bars.length - 1);
  const slope_per_min_pct = return_pct / minutes;

  return {
    count: bars.length,
    start,
    end,
    return_pct,
    high,
    low,
    range_pct,
    mean_abs_return_pct,
    slope_per_min_pct,
    last_close: end,
  };
}

function pctChange(a: number, b: number) {
  if (a === 0) return 0;
  return ((b - a) / a) * 100;
}
