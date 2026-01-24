import type { Market, OhlcSummary } from "../types/ai";

/**
 * LLM 입력을 짧게 만들기 위한 "텍스트 컨텍스트" 생성
 * - 장황한 리포트가 아니라 "필터 판단"에 필요한 최소 정보만 포함
 */
export function buildAiContext(params: {
  market: Market;
  symbol: string;
  timeframe: string;
  windowMinutes: number;
  ohlc: OhlcSummary;
}) {
  const { market, symbol, timeframe, windowMinutes, ohlc } = params;

  // 숫자는 너무 많으면 토큰이 늘어남 → 핵심만
  return [
    `market=${market}`,
    `symbol=${symbol}`,
    `timeframe=${timeframe}`,
    `window=${windowMinutes}min`,
    `bars=${ohlc.count}`,
    `start=${round2(ohlc.start)}`,
    `end=${round2(ohlc.end)}`,
    `return_pct=${round2(ohlc.return_pct)}`,
    `range_pct=${round2(ohlc.range_pct)}`,
    `mean_abs_return_pct=${round3(ohlc.mean_abs_return_pct)}`,
    `slope_per_min_pct=${round4(ohlc.slope_per_min_pct)}`,
  ].join("\n");
}

function round2(n: number) {
  return Number(n.toFixed(2));
}
function round3(n: number) {
  return Number(n.toFixed(3));
}
function round4(n: number) {
  return Number(n.toFixed(4));
}
