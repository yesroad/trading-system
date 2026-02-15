import { DateTime } from 'luxon';
import { getSupabase, loadCryptoPositions } from '@workspace/db-client';
import type { Market } from '../config/markets.js';

export type AiDecision = 'ALLOW' | 'CAUTION' | 'BLOCK';

export type AiAnalysisRow = {
  id: number | string;
  market: Market;
  mode: string;
  symbol: string;
  decision: AiDecision;
  confidence: number;
  summary: string;
  reasons: unknown;
  risk_level: string;
  created_at: string;
};

function mustIso(value: DateTime): string {
  const iso = value.toISO();
  if (!iso) throw new Error('ISO 변환 실패');
  return iso;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * 최신 AI 분석 결과 조회
 * - market 필수
 * - symbol 지정 시 해당 종목만
 * - maxAgeMinutes 기준으로 최근 데이터만 조회
 */
export async function getLatestAIAnalysis(params: {
  market: Market;
  symbol?: string;
  limit?: number;
  maxAgeMinutes?: number;
}): Promise<AiAnalysisRow[]> {
  const supabase = getSupabase();

  const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 30)));
  const maxAgeMinutes = Math.max(1, Math.floor(params.maxAgeMinutes ?? 120));
  const cutoffIso = mustIso(DateTime.now().minus({ minutes: maxAgeMinutes }));

  let query = supabase
    .from('ai_analysis_results')
    .select('id,market,mode,symbol,decision,confidence,summary,reasons,risk_level,created_at')
    .eq('market', params.market)
    .gte('created_at', cutoffIso)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.symbol) {
    query = query.eq('symbol', params.symbol);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`ai_analysis_results 조회 실패: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const out: AiAnalysisRow[] = [];

  for (const row of rows) {
    const id = (row as { id?: unknown }).id;
    const market = (row as { market?: unknown }).market;
    const mode = (row as { mode?: unknown }).mode;
    const symbol = (row as { symbol?: unknown }).symbol;
    const decision = (row as { decision?: unknown }).decision;
    const confidenceRaw = (row as { confidence?: unknown }).confidence;
    const summary = (row as { summary?: unknown }).summary;
    const reasons = (row as { reasons?: unknown }).reasons;
    const riskLevel = (row as { risk_level?: unknown }).risk_level;
    const createdAt = (row as { created_at?: unknown }).created_at;

    if (!(typeof id === 'number' || typeof id === 'string')) continue;
    if (market !== 'KRX' && market !== 'US' && market !== 'CRYPTO') continue;
    if (typeof mode !== 'string') continue;
    if (typeof symbol !== 'string' || symbol.length === 0) continue;
    if (decision !== 'ALLOW' && decision !== 'CAUTION' && decision !== 'BLOCK') continue;

    const confidence = asNumber(confidenceRaw);
    if (confidence === null) continue;
    if (typeof summary !== 'string') continue;
    if (typeof riskLevel !== 'string') continue;
    if (typeof createdAt !== 'string') continue;

    out.push({
      id,
      market,
      mode,
      symbol,
      decision,
      confidence,
      summary,
      reasons,
      risk_level: riskLevel,
      created_at: createdAt,
    });
  }

  return out;
}

/**
 * 현재가 조회 (ticks 최신 1건)
 */
export async function getCurrentPrice(params: {
  market: Market;
  symbol: string;
}): Promise<number | null> {
  const supabase = getSupabase();

  if (params.market === 'CRYPTO') {
    const marketCode = params.symbol.startsWith('KRW-') ? params.symbol : `KRW-${params.symbol}`;

    const { data, error } = await supabase
      .from('upbit_candles')
      .select('close,candle_time_utc')
      .eq('market', marketCode)
      .order('candle_time_utc', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`upbit_candles 조회 실패: ${error.message}`);
    }

    const priceRaw = (data as { close?: unknown } | null)?.close;
    return asNumber(priceRaw);
  }

  if (params.market === 'KRX') {
    const { data, error } = await supabase
      .from('kis_price_ticks')
      .select('price,ts')
      .eq('symbol', params.symbol)
      .order('ts', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`kis_price_ticks 조회 실패: ${error.message}`);
    }

    const priceRaw = (data as { price?: unknown } | null)?.price;
    return asNumber(priceRaw);
  }

  const { data, error } = await supabase
    .from('equity_bars')
    .select('close,ts')
    .eq('symbol', params.symbol)
    .order('ts', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`equity_bars 조회 실패: ${error.message}`);
  }

  const priceRaw = (data as { close?: unknown } | null)?.close;
  return asNumber(priceRaw);
}

export { loadCryptoPositions as loadPositions };
