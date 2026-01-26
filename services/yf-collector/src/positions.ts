import { supabase } from './db/supabase';

/**
 * 보유 종목 로드 (positions 테이블)
 */
export async function loadOpenPositionSymbols(params: {
  market: string;
  limit?: number;
}): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('positions')
      .select('symbol')
      .eq('market', params.market)
      .limit(params.limit ?? 200);

    if (error) {
      console.log('[yf-collector] positions load skip:', error.message);
      return [];
    }

    if (!Array.isArray(data)) return [];

    const symbols = data
      .map((r) =>
        r && typeof (r as { symbol?: unknown }).symbol === 'string'
          ? (r as { symbol: string }).symbol
          : '',
      )
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // unique
    return Array.from(new Set(symbols));
  } catch (e) {
    console.log('[yf-collector] positions load skip:', e);
    return [];
  }
}
