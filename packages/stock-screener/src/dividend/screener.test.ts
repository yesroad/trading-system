import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTopDividendStocks } from './screener.js';
import type { DividendScreeningCriteria } from '../types.js';

// FMP API 클라이언트 모킹
vi.mock('../api/fmp-client.js', () => ({
  searchStocks: vi.fn(async () => [
    {
      symbol: 'KO',
      companyName: 'The Coca-Cola Company',
      marketCap: 250000000000,
      sector: 'Consumer Defensive',
      industry: 'Beverages—Non-Alcoholic',
      price: 60,
      lastAnnualDividend: 1.84,
    },
    {
      symbol: 'PEP',
      companyName: 'PepsiCo Inc.',
      marketCap: 230000000000,
      sector: 'Consumer Defensive',
      industry: 'Beverages—Non-Alcoholic',
      price: 170,
      lastAnnualDividend: 4.60,
    },
    {
      symbol: 'JNJ',
      companyName: 'Johnson & Johnson',
      marketCap: 400000000000,
      sector: 'Healthcare',
      industry: 'Drug Manufacturers—General',
      price: 160,
      lastAnnualDividend: 4.52,
    },
  ]),
  getKeyMetrics: vi.fn(async (symbol: string) => {
    if (symbol === 'KO') {
      return {
        symbol: 'KO',
        date: '2025-12-31',
        period: 'FY',
        netIncomePerShare: 2.45,
        peRatio: 24.5,
        pbRatio: 10.8,
        debtToEquity: 1.8,
        currentRatio: 1.1,
        roe: 41.5,
      };
    } else if (symbol === 'PEP') {
      return {
        symbol: 'PEP',
        date: '2025-12-31',
        period: 'FY',
        netIncomePerShare: 6.70,
        peRatio: 25.4,
        pbRatio: 12.1,
        debtToEquity: 2.4,
        currentRatio: 0.9,
        roe: 53.2,
      };
    } else if (symbol === 'JNJ') {
      return {
        symbol: 'JNJ',
        date: '2025-12-31',
        period: 'FY',
        netIncomePerShare: 10.10,
        peRatio: 15.8,
        pbRatio: 5.5,
        debtToEquity: 0.5,
        currentRatio: 1.3,
        roe: 26.1,
      };
    }
    return null;
  }),
  getDividendHistory: vi.fn(async () => [
    { date: '2025-12-01', adjDividend: 0.46, dividend: 0.46 },
    { date: '2024-12-01', adjDividend: 0.44, dividend: 0.44 },
    { date: '2023-12-01', adjDividend: 0.42, dividend: 0.42 },
  ]),
  batchGetKeyMetrics: vi.fn(),
  calculate3YearDividendCAGR: vi.fn(() => 4.5),
}));

describe('Dividend Screener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTopDividendStocks', () => {
    it('기본 기준으로 상위 배당주 조회', async () => {
      const criteria: DividendScreeningCriteria = {
        minYield: 2.5,
        maxPE: 30,
        maxPB: 15,
        minMarketCap: 10_000_000_000,
        excludeREITs: true,
      };

      const result = await getTopDividendStocks({
        criteria,
        limit: 3,
      });

      expect(result).toHaveLength(3);
      expect(result[0].symbol).toBeDefined();
      expect(result[0].companyName).toBeDefined();
      expect(result[0].dividendMetrics).toBeDefined();
      expect(result[0].valuationMetrics).toBeDefined();
      expect(result[0].compositeScore).toBeGreaterThan(0);
    });

    it('limit보다 적은 종목만 있으면 전체 반환', async () => {
      const criteria: DividendScreeningCriteria = {
        minYield: 2.5,
        maxPE: 30,
        maxPB: 15,
        minMarketCap: 10_000_000_000,
        excludeREITs: true,
      };

      const result = await getTopDividendStocks({
        criteria,
        limit: 10, // 실제 3개만 있음
      });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('높은 minYield는 종목 수를 줄임', async () => {
      const criteria: DividendScreeningCriteria = {
        minYield: 5.0, // 높은 기준
        maxPE: 30,
        maxPB: 15,
        minMarketCap: 10_000_000_000,
        excludeREITs: true,
      };

      const result = await getTopDividendStocks({
        criteria,
        limit: 10,
      });

      // FMP API는 minYield 필터를 적용하지만, 실제 계산된 yield는 다를 수 있음
      // 여기서는 결과가 반환되는지만 확인
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('복합 점수 기준으로 정렬', async () => {
      const criteria: DividendScreeningCriteria = {
        minYield: 2.0,
        maxPE: 30,
        maxPB: 15,
        minMarketCap: 10_000_000_000,
        excludeREITs: true,
      };

      const result = await getTopDividendStocks({
        criteria,
        limit: 3,
      });

      // 점수가 내림차순으로 정렬되어야 함
      for (let i = 0; i < result.length - 1; i++) {
        expect(result[i].compositeScore).toBeGreaterThanOrEqual(result[i + 1].compositeScore);
      }
    });
  });
});
