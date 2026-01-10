import { supabase } from "@/lib/supabase";

export type EquityBar = {
  symbol: string;
  timeframe: string;
  ts: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

export async function getLatestBars(params: {
  symbols: string[];
  timeframe?: string;
  limitPerSymbol?: number;
}) {
  const timeframe = params.timeframe ?? "1m";
  const limitPerSymbol = params.limitPerSymbol ?? 30;

  // Supabase에서 "symbol IN (...)" + timeframe 필터 후 최신순
  const { data, error } = await supabase
    .from("equity_bars")
    .select("symbol,timeframe,ts,open,high,low,close,volume")
    .in("symbol", params.symbols)
    .eq("timeframe", timeframe)
    .order("ts", { ascending: false });

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as EquityBar[];

  // 심볼별 limit 적용 (서버에서 group limit이 어려워서 클라에서 잘라줌)
  const grouped = new Map<string, EquityBar[]>();
  for (const r of rows) {
    const arr = grouped.get(r.symbol) ?? [];
    if (arr.length < limitPerSymbol) arr.push(r);
    grouped.set(r.symbol, arr);
  }

  return grouped;
}
