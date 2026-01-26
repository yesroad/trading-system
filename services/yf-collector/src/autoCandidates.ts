/**
 * 자동 후보 종목 산출 (US)
 *
 * ✅ DB 의존 없음
 * ✅ symbol_universe 사용 안 함
 *
 * 전략:
 * - Yahoo Finance trending/screener API 사용
 * - 거래량/시가총액 상위 종목을 자동 후보로 반환
 */

import { z } from 'zod';

export type AutoCandidate = {
  symbol: string; // AAPL
  last_price?: number; // 선택적
};

// Yahoo Finance trending API 응답 스키마
const TrendingTickerSchema = z.object({
  symbol: z.string(),
});

const TrendingResponseSchema = z.object({
  finance: z.object({
    result: z.array(
      z.object({
        quotes: z.array(TrendingTickerSchema),
      }),
    ),
  }),
});

/**
 * Yahoo Finance Trending Tickers API 호출
 * https://query1.finance.yahoo.com/v1/finance/trending/US
 */
async function fetchTrendingTickers(): Promise<string[]> {
  try {
    const url = 'https://query1.finance.yahoo.com/v1/finance/trending/US';
    const res = await fetch(url);

    if (!res.ok) {
      console.error('[yf-collector] trending API 실패:', res.status);
      return [];
    }

    const json = await res.json();
    const parsed = TrendingResponseSchema.safeParse(json);

    if (!parsed.success) {
      console.error('[yf-collector] trending API 응답 스키마 불일치');
      return [];
    }

    const quotes = parsed.data.finance.result[0]?.quotes ?? [];
    return quotes.map((q) => q.symbol).filter((s) => s && s.length > 0);
  } catch (e) {
    console.error('[yf-collector] trending API 예외:', e);
    return [];
  }
}

/**
 * 자동 후보 로드
 * @param limit 최종 반환 개수
 */
export async function loadAutoUsSymbols(params: { limit: number }): Promise<AutoCandidate[]> {
  const { limit } = params;

  // Yahoo Finance trending API 호출
  const trendingSymbols = await fetchTrendingTickers();

  if (trendingSymbols.length > 0) {
    // 코인 제외: -USD, -USDT 등으로 끝나는 심볼 필터링
    const stocksOnly = trendingSymbols.filter((symbol) => !symbol.includes('-'));
    console.log('[yf-collector] trending 종목:', stocksOnly.length, '개 (코인 제외)');
    return stocksOnly.slice(0, limit).map((symbol) => ({ symbol }));
  }

  // fallback: 하드코딩된 대형주 리스트
  console.log('[yf-collector] trending API 실패, fallback 사용');
  const fallbackSymbols = [
    'AAPL',
    'MSFT',
    'GOOGL',
    'AMZN',
    'NVDA',
    'META',
    'TSLA',
    'BRK.B',
    'JPM',
    'V',
    'UNH',
    'JNJ',
    'WMT',
    'XOM',
    'MA',
    'PG',
    'HD',
    'CVX',
    'LLY',
    'ABBV',
  ];

  return fallbackSymbols.slice(0, limit).map((symbol) => ({ symbol }));
}
