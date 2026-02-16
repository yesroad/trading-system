import { requireEnv, createLogger } from '@workspace/shared-utils';
import { z } from 'zod';
import {
  FMPStockSchema,
  FMPKeyMetricsSchema,
  FMPDividendHistorySchema,
  type FMPStock,
  type FMPKeyMetrics,
  type FMPDividendHistory,
} from '../types.js';

const logger = createLogger('fmp-client');
const FMP_API_KEY = requireEnv('FMP_API_KEY');
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * FMP API 일반 요청 함수
 */
async function fetchFMP<T>(endpoint: string, schema: z.ZodType<T>): Promise<T> {
  const url = `${FMP_BASE_URL}${endpoint}${endpoint.includes('?') ? '&' : '?'}apikey=${FMP_API_KEY}`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FMP API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();

    // Zod 검증
    const validatedData = schema.parse(rawData);

    return validatedData;
  } catch (error) {
    logger.error('FMP API 요청 실패', { endpoint, error });
    throw error;
  }
}

/**
 * Stock Screener API로 종목 검색
 *
 * @param filters - 필터 조건
 * @returns 종목 목록
 */
export async function searchStocks(filters: {
  marketCapMoreThan?: number;
  dividendMoreThan?: number;
  sector?: string;
  exchange?: string;
  limit?: number;
}): Promise<FMPStock[]> {
  const params = new URLSearchParams();

  if (filters.marketCapMoreThan !== undefined) {
    params.append('marketCapMoreThan', filters.marketCapMoreThan.toString());
  }

  if (filters.dividendMoreThan !== undefined) {
    params.append('dividendMoreThan', filters.dividendMoreThan.toString());
  }

  if (filters.sector) {
    params.append('sector', filters.sector);
  }

  if (filters.exchange) {
    params.append('exchange', filters.exchange);
  }

  if (filters.limit) {
    params.append('limit', filters.limit.toString());
  }

  const endpoint = `/stock-screener?${params.toString()}`;

  logger.info('Stock Screener 조회', { filters });

  const data = await fetchFMP(endpoint, z.array(FMPStockSchema));

  logger.info('Stock Screener 조회 완료', { count: data.length });

  return data;
}

/**
 * 종목의 Key Metrics 조회 (최신 1개)
 *
 * @param symbol - 종목 심볼
 * @returns Key Metrics
 */
export async function getKeyMetrics(symbol: string): Promise<FMPKeyMetrics | null> {
  const endpoint = `/key-metrics/${symbol}?limit=1`;

  try {
    const data = await fetchFMP(endpoint, z.array(FMPKeyMetricsSchema));

    if (data.length === 0) {
      logger.warn('Key Metrics 없음', { symbol });
      return null;
    }

    return data[0];
  } catch (error) {
    logger.error('Key Metrics 조회 실패', { symbol, error });
    return null;
  }
}

/**
 * 종목의 배당 히스토리 조회
 *
 * @param symbol - 종목 심볼
 * @returns 배당 히스토리 (최신순)
 */
export async function getDividendHistory(symbol: string): Promise<FMPDividendHistory[]> {
  const endpoint = `/historical-price-full/stock_dividend/${symbol}`;

  try {
    const ResponseSchema = z.object({
      symbol: z.string(),
      historical: z.array(FMPDividendHistorySchema),
    });

    const data = await fetchFMP(endpoint, ResponseSchema);

    if (!data.historical || data.historical.length === 0) {
      logger.warn('배당 히스토리 없음', { symbol });
      return [];
    }

    // 날짜 역순 정렬 (최신 먼저)
    const sorted = data.historical.sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    logger.debug('배당 히스토리 조회 완료', { symbol, count: sorted.length });

    return sorted;
  } catch (error) {
    logger.error('배당 히스토리 조회 실패', { symbol, error });
    return [];
  }
}

/**
 * 종목의 배당 성장률 계산 (3년 CAGR)
 *
 * @param dividendHistory - 배당 히스토리 (최신순)
 * @returns 3년 배당 성장률 (CAGR) 또는 null
 */
export function calculate3YearDividendCAGR(dividendHistory: FMPDividendHistory[]): number | null {
  if (dividendHistory.length < 4) {
    // 최소 4년 데이터 필요 (3년 성장률 계산)
    return null;
  }

  // 연도별 배당 합산
  const yearlyDividends = new Map<number, number>();

  for (const dividend of dividendHistory) {
    const year = new Date(dividend.date).getFullYear();
    const current = yearlyDividends.get(year) || 0;
    yearlyDividends.set(year, current + dividend.adjDividend);
  }

  // 연도 정렬
  const years = Array.from(yearlyDividends.keys()).sort((a, b) => b - a);

  if (years.length < 4) {
    return null;
  }

  // 최근 3년 CAGR 계산
  const latestYear = years[0];
  const threeYearsAgo = years[3];

  const latestDividend = yearlyDividends.get(latestYear) || 0;
  const oldDividend = yearlyDividends.get(threeYearsAgo) || 0;

  if (oldDividend === 0) {
    return null;
  }

  // CAGR = ((Ending Value / Beginning Value) ^ (1 / Years)) - 1
  const cagr = Math.pow(latestDividend / oldDividend, 1 / 3) - 1;

  return cagr * 100; // 퍼센트로 변환
}

/**
 * 배치 요청 (여러 종목의 Key Metrics 조회)
 *
 * @param symbols - 종목 심볼 배열
 * @returns Key Metrics 맵 (symbol -> metrics)
 */
export async function batchGetKeyMetrics(
  symbols: string[]
): Promise<Map<string, FMPKeyMetrics>> {
  const results = new Map<string, FMPKeyMetrics>();

  // FMP API는 배치 요청을 지원하지 않으므로 순차 요청
  // 실제로는 병렬 요청 + rate limiting 필요
  for (const symbol of symbols) {
    try {
      const metrics = await getKeyMetrics(symbol);
      if (metrics) {
        results.set(symbol, metrics);
      }
    } catch (error) {
      logger.warn('Key Metrics 조회 실패 (스킵)', { symbol, error });
    }
  }

  return results;
}
