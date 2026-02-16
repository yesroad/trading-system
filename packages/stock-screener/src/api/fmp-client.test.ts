import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculate3YearDividendCAGR,
  searchStocks,
  getKeyMetrics,
  getDividendHistory,
  batchGetKeyMetrics,
} from './fmp-client.js';
import type { FMPDividendHistory } from '../types.js';

// requireEnv 모킹
vi.mock('@workspace/shared-utils', async () => {
  const actual = await vi.importActual<typeof import('@workspace/shared-utils')>('@workspace/shared-utils');
  return {
    ...actual,
    requireEnv: vi.fn((key: string) => {
      if (key === 'FMP_API_KEY') return 'test-api-key';
      return '';
    }),
  };
});

// fetch 모킹
global.fetch = vi.fn();

describe('FMP Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculate3YearDividendCAGR', () => {
    it('3년 배당 성장률을 올바르게 계산', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 1.20, dividend: 1.20 },
        { date: '2024-12-01', adjDividend: 1.10, dividend: 1.10 },
        { date: '2023-12-01', adjDividend: 1.05, dividend: 1.05 },
        { date: '2022-12-01', adjDividend: 1.00, dividend: 1.00 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      // CAGR = ((1.20 / 1.00) ^ (1/3)) - 1 = 0.0627 = 6.27%
      expect(result).toBeCloseTo(6.27, 1);
    });

    it('배당 히스토리가 4년 미만이면 null 반환', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 1.20, dividend: 1.20 },
        { date: '2024-12-01', adjDividend: 1.10, dividend: 1.10 },
        { date: '2023-12-01', adjDividend: 1.05, dividend: 1.05 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      expect(result).toBeNull();
    });

    it('빈 배당 히스토리는 null 반환', () => {
      const dividendHistory: FMPDividendHistory[] = [];

      const result = calculate3YearDividendCAGR(dividendHistory);

      expect(result).toBeNull();
    });

    it('연도별 배당 합산 (분기 배당)', () => {
      const dividendHistory: FMPDividendHistory[] = [
        // 2025년 (4분기)
        { date: '2025-12-01', adjDividend: 0.30, dividend: 0.30 },
        { date: '2025-09-01', adjDividend: 0.30, dividend: 0.30 },
        { date: '2025-06-01', adjDividend: 0.30, dividend: 0.30 },
        { date: '2025-03-01', adjDividend: 0.30, dividend: 0.30 },
        // 2024년 (4분기)
        { date: '2024-12-01', adjDividend: 0.28, dividend: 0.28 },
        { date: '2024-09-01', adjDividend: 0.28, dividend: 0.28 },
        { date: '2024-06-01', adjDividend: 0.28, dividend: 0.28 },
        { date: '2024-03-01', adjDividend: 0.28, dividend: 0.28 },
        // 2023년 (4분기)
        { date: '2023-12-01', adjDividend: 0.26, dividend: 0.26 },
        { date: '2023-09-01', adjDividend: 0.26, dividend: 0.26 },
        { date: '2023-06-01', adjDividend: 0.26, dividend: 0.26 },
        { date: '2023-03-01', adjDividend: 0.26, dividend: 0.26 },
        // 2022년 (4분기)
        { date: '2022-12-01', adjDividend: 0.25, dividend: 0.25 },
        { date: '2022-09-01', adjDividend: 0.25, dividend: 0.25 },
        { date: '2022-06-01', adjDividend: 0.25, dividend: 0.25 },
        { date: '2022-03-01', adjDividend: 0.25, dividend: 0.25 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      // 2025: 1.20, 2024: 1.12, 2023: 1.04, 2022: 1.00
      // CAGR = ((1.20 / 1.00) ^ (1/3)) - 1 = 0.0627 = 6.27%
      expect(result).toBeCloseTo(6.27, 1);
    });

    it('배당이 증가하지 않으면 0% 성장률', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 1.00, dividend: 1.00 },
        { date: '2024-12-01', adjDividend: 1.00, dividend: 1.00 },
        { date: '2023-12-01', adjDividend: 1.00, dividend: 1.00 },
        { date: '2022-12-01', adjDividend: 1.00, dividend: 1.00 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      expect(result).toBeCloseTo(0, 1);
    });

    it('배당이 감소하면 음수 성장률', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 0.90, dividend: 0.90 },
        { date: '2024-12-01', adjDividend: 0.95, dividend: 0.95 },
        { date: '2023-12-01', adjDividend: 0.98, dividend: 0.98 },
        { date: '2022-12-01', adjDividend: 1.00, dividend: 1.00 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      // CAGR = ((0.90 / 1.00) ^ (1/3)) - 1 = -0.0345 = -3.45%
      expect(result).toBeLessThan(0);
      expect(result).toBeCloseTo(-3.45, 1);
    });

    it('3년 전 배당이 0이면 null 반환', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 1.20, dividend: 1.20 },
        { date: '2024-12-01', adjDividend: 1.10, dividend: 1.10 },
        { date: '2023-12-01', adjDividend: 1.05, dividend: 1.05 },
        { date: '2022-12-01', adjDividend: 0, dividend: 0 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      expect(result).toBeNull();
    });

    it('높은 성장률 계산', () => {
      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 2.00, dividend: 2.00 },
        { date: '2024-12-01', adjDividend: 1.50, dividend: 1.50 },
        { date: '2023-12-01', adjDividend: 1.20, dividend: 1.20 },
        { date: '2022-12-01', adjDividend: 1.00, dividend: 1.00 },
      ];

      const result = calculate3YearDividendCAGR(dividendHistory);

      // CAGR = ((2.00 / 1.00) ^ (1/3)) - 1 = 0.2599 = 25.99%
      expect(result).toBeCloseTo(26.0, 0);
    });
  });

  describe('searchStocks', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('성공적으로 종목 검색', async () => {
      const mockResponse = [
        {
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          marketCap: 3000000000000,
          price: 175,
          lastAnnualDividend: 0.96,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await searchStocks({
        marketCapMoreThan: 1000000000,
        dividendMoreThan: 0.5,
        limit: 100,
      });

      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe('AAPL');
    });

    it('API 오류 시 에러 throw', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(searchStocks({ limit: 100 })).rejects.toThrow();
    });
  });

  describe('getKeyMetrics', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('성공적으로 Key Metrics 조회', async () => {
      const mockResponse = [
        {
          symbol: 'AAPL',
          date: '2025-12-31',
          period: 'FY',
          peRatio: 28.5,
          pbRatio: 45.2,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getKeyMetrics('AAPL');

      expect(result).not.toBeNull();
      expect(result?.symbol).toBe('AAPL');
    });

    it('데이터가 없으면 null 반환', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await getKeyMetrics('UNKNOWN');

      expect(result).toBeNull();
    });

    it('API 오류 시 null 반환', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await getKeyMetrics('ERROR');

      expect(result).toBeNull();
    });
  });

  describe('getDividendHistory', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('성공적으로 배당 히스토리 조회', async () => {
      const mockResponse = {
        symbol: 'AAPL',
        historical: [
          { date: '2025-12-01', adjDividend: 0.24, dividend: 0.24 },
          { date: '2024-12-01', adjDividend: 0.23, dividend: 0.23 },
        ],
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await getDividendHistory('AAPL');

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2025-12-01');
    });

    it('배당 히스토리가 없으면 빈 배열 반환', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ symbol: 'UNKNOWN', historical: [] }),
      });

      const result = await getDividendHistory('UNKNOWN');

      expect(result).toHaveLength(0);
    });

    it('API 오류 시 빈 배열 반환', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await getDividendHistory('ERROR');

      expect(result).toHaveLength(0);
    });
  });

  describe('batchGetKeyMetrics', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('여러 종목의 Key Metrics 조회', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              symbol: 'AAPL',
              date: '2025-12-31',
              period: 'FY',
              peRatio: 28.5,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              symbol: 'MSFT',
              date: '2025-12-31',
              period: 'FY',
              peRatio: 32.1,
            },
          ],
        });

      const result = await batchGetKeyMetrics(['AAPL', 'MSFT']);

      expect(result.size).toBe(2);
      expect(result.get('AAPL')).toBeDefined();
      expect(result.get('MSFT')).toBeDefined();
    });

    it('일부 종목 실패 시 성공한 종목만 반환', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            {
              symbol: 'AAPL',
              date: '2025-12-31',
              period: 'FY',
              peRatio: 28.5,
            },
          ],
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      const result = await batchGetKeyMetrics(['AAPL', 'ERROR']);

      expect(result.size).toBe(1);
      expect(result.get('AAPL')).toBeDefined();
      expect(result.get('ERROR')).toBeUndefined();
    });
  });
});
