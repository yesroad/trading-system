/**
 * Yahoo Chart API 호출
 * - 1분봉 데이터
 * - 비공식 API → 최소 검증만 수행
 */

import { z } from "zod";
import type { Nullable } from "./types/utils";

const QuoteSchema = z.object({
  open: z.array(z.number().nullable()),
  high: z.array(z.number().nullable()),
  low: z.array(z.number().nullable()),
  close: z.array(z.number().nullable()),
  volume: z.array(z.number().nullable()),
});

const ResultSchema = z.object({
  timestamp: z.array(z.number()),
  indicators: z.object({
    quote: z.array(QuoteSchema),
  }),
});

const ChartSchema = z.object({
  chart: z.object({
    result: z.array(ResultSchema),
  }),
});

export type YahooBar = {
  ts: string;
  open: Nullable<number>;
  high: Nullable<number>;
  low: Nullable<number>;
  close: Nullable<number>;
  volume: Nullable<number>;
};

export async function fetchYahooBars(symbol: string): Promise<YahooBar[]> {
  const url = new URL(
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`,
  );
  url.searchParams.set("interval", "1m");
  url.searchParams.set("range", "1d");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Yahoo API failed: ${res.status}`);
  }

  const json = await res.json();
  const parsed = ChartSchema.safeParse(json);

  if (!parsed.success) {
    console.error("[yf-collector] Yahoo 응답 스키마 불일치");
    return [];
  }

  const r = parsed.data.chart.result[0];
  const q = r.indicators.quote[0];

  return r.timestamp.map((ts, i) => ({
    ts: new Date(ts * 1000).toISOString(),
    open: q.open[i],
    high: q.high[i],
    low: q.low[i],
    close: q.close[i],
    volume: q.volume[i],
  }));
}
