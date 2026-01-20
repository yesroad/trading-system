/**
 * 추적 종목 로더 (DB)
 */

import { supabase } from './supabase.js';
import type { Nullable } from './types/utils.js';

export type TrackedSymbol = {
  id: number;
  broker: string;
  market: string;
  broker_code: string;
  symbol: string;
  name: Nullable<string>;
  is_active: boolean;
  poll_interval_ms: number;
};

export async function loadActiveKisKrxSymbols() {
  const { data, error } = await supabase
    .from('tracked_symbols')
    .select('id,broker,market,broker_code,symbol,name,is_active,poll_interval_ms')
    .eq('is_active', true)
    .eq('broker', 'KIS')
    .eq('market', 'KRX')
    .order('id', { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as TrackedSymbol[];
}
