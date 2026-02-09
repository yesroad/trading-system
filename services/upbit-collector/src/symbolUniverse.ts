// /services/upbit-collector/src/symbolUniverse.ts
import { supabase } from './db/supabase.js';
import type { Nullable } from '@workspace/shared-utils';

export type SymbolUniverseRow = {
  market: string; // 'CRYPTO'
  symbol: string; // 'BTC', 'ETH', ...
  enabled: boolean;
  priority: number;
  note: Nullable<string>;
  updated_at: string;
};

/**
 * ✅ symbol_universe에서 "DB 등록 코인" 로딩
 * - market='CRYPTO', enabled=true 인 종목만
 */
export async function loadSymbolUniverse(params: {
  market?: string;
  limit?: number;
}): Promise<SymbolUniverseRow[]> {
  const market = params.market || 'CRYPTO';
  const limit = Math.max(1, Math.min(2000, Math.floor(params.limit ?? 500)));

  const { data, error } = await supabase
    .from('symbol_universe')
    .select('market,symbol,enabled,priority,note,updated_at')
    .eq('market', market)
    .eq('enabled', true)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  const out: SymbolUniverseRow[] = [];

  for (const r of rows) {
    const marketVal = (r as { market?: unknown }).market;
    const symbol = (r as { symbol?: unknown }).symbol;
    const enabled = (r as { enabled?: unknown }).enabled;
    const priority = (r as { priority?: unknown }).priority;
    const note = (r as { note?: unknown }).note;
    const updated_at = (r as { updated_at?: unknown }).updated_at;

    if (typeof marketVal !== 'string') continue;
    if (typeof symbol !== 'string' || symbol.length === 0) continue;
    if (typeof enabled !== 'boolean') continue;
    if (typeof priority !== 'number') continue;
    if (typeof updated_at !== 'string') continue;

    out.push({
      market: marketVal,
      symbol,
      enabled,
      priority,
      note: typeof note === 'string' ? note : null,
      updated_at,
    });
  }

  return out;
}
