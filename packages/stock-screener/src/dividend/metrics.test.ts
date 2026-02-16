import { describe, it, expect, vi, beforeAll } from 'vitest';
import Big from 'big.js';
import {
  calculateDividendYield,
  calculatePayoutRatio,
  assessSustainability,
  calculateDividendMetrics,
  calculateCompositeScore,
} from './metrics.js';
import type {
  FMPStock,
  FMPKeyMetrics,
  FMPDividendHistory,
  DividendMetrics,
} from '../types.js';

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

describe('Dividend Metrics', () => {
  describe('calculateDividendYield', () => {
    it('배당 수익률을 올바르게 계산', () => {
      const result = calculateDividendYield(5.0, 100);

      expect(result.toNumber()).toBe(5.0);
    });

    it('가격이 0이면 배당 수익률 0 반환', () => {
      const result = calculateDividendYield(5.0, 0);

      expect(result.toNumber()).toBe(0);
    });

    it('배당금이 0이면 배당 수익률 0 반환', () => {
      const result = calculateDividendYield(0, 100);

      expect(result.toNumber()).toBe(0);
    });

    it('높은 배당 수익률 계산', () => {
      const result = calculateDividendYield(8.0, 100);

      expect(result.toNumber()).toBe(8.0);
    });
  });

  describe('calculatePayoutRatio', () => {
    it('배당 성향을 올바르게 계산', () => {
      const result = calculatePayoutRatio(2.0, 4.0);

      expect(result?.toNumber()).toBe(50.0);
    });

    it('EPS가 null이면 null 반환', () => {
      const result = calculatePayoutRatio(2.0, null);

      expect(result).toBeNull();
    });

    it('EPS가 0이면 null 반환', () => {
      const result = calculatePayoutRatio(2.0, 0);

      expect(result).toBeNull();
    });

    it('높은 배당 성향 계산', () => {
      const result = calculatePayoutRatio(3.6, 4.0);

      expect(result?.toNumber()).toBe(90.0);
    });

    it('낮은 배당 성향 계산', () => {
      const result = calculatePayoutRatio(1.0, 4.0);

      expect(result?.toNumber()).toBe(25.0);
    });
  });

  describe('assessSustainability', () => {
    it('낮은 배당 성향, 낮은 부채, 높은 유동비율 = high', () => {
      const result = assessSustainability({
        payoutRatio: Big(40), // 3점
        debtToEquity: 0.3, // 2점
        currentRatio: 2.5, // 2점
      });

      expect(result).toBe('high'); // 총 7점 >= 6
    });

    it('중간 지표 = medium', () => {
      const result = assessSustainability({
        payoutRatio: Big(60), // 2점
        debtToEquity: 0.8, // 1점
        currentRatio: 1.8, // 1점
      });

      expect(result).toBe('medium'); // 총 4점 >= 3
    });

    it('높은 배당 성향, 높은 부채, 낮은 유동비율 = low', () => {
      const result = assessSustainability({
        payoutRatio: Big(95), // 0점
        debtToEquity: 2.0, // 0점
        currentRatio: 1.0, // 0점
      });

      expect(result).toBe('low'); // 총 0점 < 3
    });

    it('배당 성향만 있어도 평가 가능', () => {
      const result = assessSustainability({
        payoutRatio: Big(30), // 3점
        debtToEquity: null,
        currentRatio: null,
      });

      expect(result).toBe('medium'); // 총 3점 >= 3
    });

    it('모든 지표 null이면 low', () => {
      const result = assessSustainability({
        payoutRatio: null,
        debtToEquity: null,
        currentRatio: null,
      });

      expect(result).toBe('low'); // 총 0점
    });
  });

  describe('calculateDividendMetrics', () => {
    it('전체 배당 지표를 올바르게 계산', () => {
      const stock: FMPStock = {
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        marketCap: 3000000000000,
        price: 175,
        lastAnnualDividend: 0.96,
      };

      const keyMetrics: FMPKeyMetrics = {
        symbol: 'AAPL',
        date: '2025-12-31',
        period: 'FY',
        netIncomePerShare: 6.15,
        peRatio: 28.5,
        pbRatio: 45.2,
        debtToEquity: 1.8,
        currentRatio: 1.0,
        roe: 160.0,
      };

      const dividendHistory: FMPDividendHistory[] = [
        { date: '2025-12-01', adjDividend: 0.24, dividend: 0.24 },
        { date: '2024-12-01', adjDividend: 0.23, dividend: 0.23 },
        { date: '2023-12-01', adjDividend: 0.22, dividend: 0.22 },
      ];

      const result = calculateDividendMetrics({
        stock,
        keyMetrics,
        dividendHistory,
      });

      expect(result.yield.toNumber()).toBeCloseTo(0.548, 2); // 0.96 / 175 * 100
      expect(result.payoutRatio?.toNumber()).toBeCloseTo(15.61, 1); // 0.96 / 6.15 * 100
      expect(result.sustainability).toBe('medium'); // payoutRatio 15.61% → 3점, debtToEquity 1.8 → 0점, currentRatio 1.0 → 0점 = 3점 = medium
      expect(result.lastDividend).toBe(0.96);
      expect(result.dividendHistory).toHaveLength(3);
    });

    it('keyMetrics가 null이어도 동작', () => {
      const stock: FMPStock = {
        symbol: 'TEST',
        companyName: 'Test Corp',
        marketCap: 1000000000,
        price: 50,
        lastAnnualDividend: 2.5,
      };

      const result = calculateDividendMetrics({
        stock,
        keyMetrics: null,
        dividendHistory: [],
      });

      expect(result.yield.toNumber()).toBe(5.0); // 2.5 / 50 * 100
      expect(result.payoutRatio).toBeNull();
      expect(result.dividendCAGR).toBeNull();
      expect(result.sustainability).toBe('low'); // 지표 없음
    });
  });

  describe('calculateCompositeScore', () => {
    it('우수한 배당주는 높은 점수', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(5.2), // 30점
        payoutRatio: Big(45),
        dividendCAGR: Big(12), // 20점
        sustainability: 'high',
        lastDividend: 5.2,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: 12, // 10점
        pbRatio: 0.9, // 10점
        roe: 18, // 10점
        debtToEquity: 0.4, // 10점
      });

      expect(result).toBe(90); // 30 + 20 + 20 + 20
    });

    it('낮은 배당 수익률, 낮은 성장률 = 낮은 점수', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(1.5), // 0점
        payoutRatio: Big(90),
        dividendCAGR: Big(2), // 5점
        sustainability: 'low',
        lastDividend: 1.5,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: 30, // 0점
        pbRatio: 3.0, // 0점
        roe: 5, // 0점
        debtToEquity: 2.5, // 0점
      });

      expect(result).toBe(5); // 0 + 5 + 0 + 0
    });

    it('중간 배당주는 중간 점수', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(3.5), // 20점
        payoutRatio: Big(60),
        dividendCAGR: Big(7), // 15점
        sustainability: 'medium',
        lastDividend: 3.5,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: 16, // 5점
        pbRatio: 1.3, // 5점
        roe: 12, // 5점
        debtToEquity: 0.8, // 5점
      });

      expect(result).toBe(55); // 20 + 15 + 10 + 10
    });

    it('밸류에이션 점수는 최대 25점', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(0), // 0점
        payoutRatio: null,
        dividendCAGR: null, // 0점
        sustainability: 'low',
        lastDividend: 0,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: 5, // 15점
        pbRatio: 0.5, // 10점 (합계 25점이지만 최대 25점)
        roe: null,
        debtToEquity: null,
      });

      expect(result).toBe(25); // 0 + 0 + 25 + 0
    });

    it('재무 건전성 점수는 최대 20점', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(0), // 0점
        payoutRatio: null,
        dividendCAGR: null, // 0점
        sustainability: 'low',
        lastDividend: 0,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: null,
        pbRatio: null,
        roe: 20, // 10점
        debtToEquity: 0.3, // 10점 (합계 20점이지만 최대 20점)
      });

      expect(result).toBe(20); // 0 + 0 + 0 + 20
    });

    it('모든 지표 null이면 0점', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(0),
        payoutRatio: null,
        dividendCAGR: null,
        sustainability: 'low',
        lastDividend: 0,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: null,
        pbRatio: null,
        roe: null,
        debtToEquity: null,
      });

      expect(result).toBe(0);
    });

    it('최대 점수는 100점', () => {
      const dividendMetrics: DividendMetrics = {
        yield: Big(10), // 30점
        payoutRatio: Big(20),
        dividendCAGR: Big(25), // 25점
        sustainability: 'high',
        lastDividend: 10,
        dividendHistory: [],
      };

      const result = calculateCompositeScore({
        dividendMetrics,
        peRatio: 5, // 15점 (밸류에이션 최대 25점)
        pbRatio: 0.5, // 10점
        roe: 25, // 10점 (재무 건전성 최대 20점)
        debtToEquity: 0.2, // 10점
      });

      expect(result).toBe(100); // 30 + 25 + 25 + 20
    });
  });
});
