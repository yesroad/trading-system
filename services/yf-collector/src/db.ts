/**
 * equity_bars upsert
 */

import { supabase } from "./supabase.js";
import { YahooBar } from "./fetchYahoo.js";

export async function upsertBars(
  symbol: string,
  timeframe: string,
  bars: YahooBar[]
) {
  if (bars.length === 0) return { inserted: 0 };

  const rows = bars.map((b) => ({
    symbol,
    timeframe,
    ts: b.ts,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    source: "yahoo",
  }));

  const { error } = await supabase.from("equity_bars").upsert(rows, {
    onConflict: "symbol,timeframe,ts",
    ignoreDuplicates: true,
  });

  if (error) throw error;

  return { inserted: rows.length };
}
