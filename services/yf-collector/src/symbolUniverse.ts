import { supabase } from './db/supabase.js';
import type { Nullable } from '@workspace/shared-utils';

export type UniverseSymbolRow = {
  market: string; // 'KR' | 'US' | 'CRYPTO' ...
  symbol: string;
  enabled: boolean;
  priority: number;
  note: Nullable<string>;
  updated_at: string;
};

/**
 * ✅ DB 등록 종목 로더
 * - symbol_universe에서 market + enabled=true 조건으로 종목을 불러온다
 * - 우선순위: priority desc, updated_at desc
 */
export async function loadEnabledUniverseSymbols(params: {
  market: string; // 'KR' | 'US' | 'CRYPTO'
  limit: number;
}): Promise<UniverseSymbolRow[]> {
  const market = String(params.market || '').trim();
  const limit = Math.max(1, Math.min(5000, Math.floor(params.limit)));

  if (!market) return [];

  const { data, error } = await supabase
    .from('symbol_universe')
    .select('market,symbol,enabled,priority,note,updated_at')
    .eq('market', market)
    .eq('enabled', true)
    .order('priority', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data ?? []) as UniverseSymbolRow[];
}
