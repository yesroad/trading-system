// /services/upbit-collector/src/positions.ts
import { supabase } from './db/supabase';
import type { Nullable } from './types/utils';

export type PositionRow = {
  broker: string; // 'UPBIT'
  market: string; // 'CRYPTO'
  symbol: string; // 'BTC', 'ETH', ...
  qty: number; // numeric -> number
  avg_price: Nullable<number>;
  updated_at: string;
};

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * ✅ positions에서 "보유 코인" 로딩
 * - market='CRYPTO' AND qty > 0 인 종목만
 * - 보유 코인은 항상 수집 대상
 */
export async function loadCryptoPositions(params: {
  broker?: string;
  limit?: number;
}): Promise<PositionRow[]> {
  const broker = params.broker || 'UPBIT';
  const limit = Math.max(1, Math.min(2000, Math.floor(params.limit ?? 500)));

  const { data, error } = await supabase
    .from('positions')
    .select('broker,market,symbol,qty,avg_price,updated_at')
    .eq('broker', broker)
    .eq('market', 'CRYPTO')
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const out: PositionRow[] = [];

  for (const r of rows) {
    const brokerVal = (r as { broker?: unknown }).broker;
    const market = (r as { market?: unknown }).market;
    const symbol = (r as { symbol?: unknown }).symbol;
    const qtyRaw = (r as { qty?: unknown }).qty;
    const avgRaw = (r as { avg_price?: unknown }).avg_price;
    const updated_at = (r as { updated_at?: unknown }).updated_at;

    if (typeof brokerVal !== 'string') continue;
    if (typeof market !== 'string') continue;
    if (typeof symbol !== 'string' || symbol.length === 0) continue;

    const qty = toNumber(qtyRaw);
    if (qty === null || qty <= 0) continue;

    const avg_price = toNumber(avgRaw);
    if (typeof updated_at !== 'string') continue;

    out.push({
      broker: brokerVal,
      market,
      symbol,
      qty,
      avg_price,
      updated_at,
    });
  }

  return out;
}
