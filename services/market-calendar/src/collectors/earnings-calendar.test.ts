import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformEarningsEvent, collectEarningsCalendar } from './earnings-calendar.js';
import type { EarningsEvent } from '../types.js';

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

describe('Earnings Calendar Collector', () => {
  describe('transformEarningsEvent', () => {
    it('BMO (Before Market Open) 실적 발표를 올바르게 변환', () => {
      const event: EarningsEvent = {
        symbol: 'AAPL',
        date: '2026-03-18',
        time: 'bmo',
        eps: 1.25,
        epsEstimated: 1.20,
        revenue: 95000000000,
        revenueEstimated: 94000000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.type).toBe('earnings');
      expect(result.title).toBe('AAPL 실적 발표 (BMO)');
      expect(result.summary).toContain('EPS 예상: $1.20');
      expect(result.summary).toContain('매출 예상: $94000M');
      expect(result.source).toBe('FMP Earnings Calendar');
      expect(result.publishedAt).toBe('2026-03-18T08:00:00Z');
      expect(result.impactScore).toBeGreaterThanOrEqual(5);
      expect(result.impactScore).toBeLessThanOrEqual(9);
      expect(result.metadata).toEqual({
        symbol: 'AAPL',
        eps: 1.25,
        epsEstimated: 1.20,
        revenue: 95000000000,
        revenueEstimated: 94000000000,
        time: 'bmo',
      });
    });

    it('AMC (After Market Close) 실적 발표를 올바르게 변환', () => {
      const event: EarningsEvent = {
        symbol: 'TSLA',
        date: '2026-03-20',
        time: 'amc',
        eps: 0.85,
        epsEstimated: 0.80,
        revenue: 22000000000,
        revenueEstimated: 21000000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.title).toBe('TSLA 실적 발표 (AMC)');
      expect(result.publishedAt).toBe('2026-03-20T16:00:00Z');
    });

    it('TBC (Time To Be Confirmed) 실적 발표를 올바르게 변환', () => {
      const event: EarningsEvent = {
        symbol: 'GOOGL',
        date: '2026-03-25',
        time: 'tbc',
        eps: null,
        epsEstimated: 1.50,
        revenue: null,
        revenueEstimated: 75000000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.title).toBe('GOOGL 실적 발표 (TAS)');
      expect(result.publishedAt).toBe('2026-03-25T09:30:00Z');
      expect(result.impactScore).toBe(5); // 실제 EPS 없으면 기본 점수
    });

    it('큰 EPS 서프라이즈 (20% 이상)는 높은 임팩트 점수', () => {
      const event: EarningsEvent = {
        symbol: 'NVDA',
        date: '2026-03-22',
        time: 'amc',
        eps: 1.50, // 25% 서프라이즈
        epsEstimated: 1.20,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(9);
    });

    it('중간 EPS 서프라이즈 (10-20%)는 중간 임팩트 점수', () => {
      const event: EarningsEvent = {
        symbol: 'MSFT',
        date: '2026-03-24',
        time: 'amc',
        eps: 2.20, // 10% 서프라이즈
        epsEstimated: 2.00,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(7);
    });

    it('작은 EPS 서프라이즈 (5-10%)는 보통 임팩트 점수', () => {
      const event: EarningsEvent = {
        symbol: 'AMZN',
        date: '2026-03-26',
        time: 'amc',
        eps: 1.08, // 8% 서프라이즈
        epsEstimated: 1.00,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(6);
    });

    it('매우 작은 EPS 서프라이즈는 낮은 임팩트 점수', () => {
      const event: EarningsEvent = {
        symbol: 'META',
        date: '2026-03-28',
        time: 'amc',
        eps: 3.03, // 3% 서프라이즈
        epsEstimated: 3.00,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(5);
    });

    it('예상 EPS만 있고 실제 EPS가 없으면 기본 점수', () => {
      const event: EarningsEvent = {
        symbol: 'NFLX',
        date: '2026-03-30',
        time: 'amc',
        eps: null,
        epsEstimated: 2.50,
        revenue: null,
        revenueEstimated: 8500000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(5);
      expect(result.summary).toContain('EPS 예상: $2.50');
      expect(result.summary).toContain('매출 예상: $8500M');
    });

    it('EPS/매출 예상치가 모두 없으면 기본 요약', () => {
      const event: EarningsEvent = {
        symbol: 'DIS',
        date: '2026-04-01',
        time: 'amc',
        eps: null,
        epsEstimated: null,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.summary).toBe('DIS 실적 발표 예정');
      expect(result.impactScore).toBe(5);
    });

    it('affectedSectors는 null (개별 종목)', () => {
      const event: EarningsEvent = {
        symbol: 'JPM',
        date: '2026-04-05',
        time: 'bmo',
        eps: 3.50,
        epsEstimated: 3.40,
        revenue: 32000000000,
        revenueEstimated: 31000000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.affectedSectors).toBeNull();
    });

    it('priceImpactPct는 null (실적 발표 전)', () => {
      const event: EarningsEvent = {
        symbol: 'BAC',
        date: '2026-04-08',
        time: 'bmo',
        eps: 0.75,
        epsEstimated: 0.70,
        revenue: 25000000000,
        revenueEstimated: 24000000000,
      };

      const result = transformEarningsEvent(event);

      expect(result.priceImpactPct).toBeNull();
    });

    it('음수 EPS 서프라이즈도 절댓값 기준 점수 계산', () => {
      const event: EarningsEvent = {
        symbol: 'UBER',
        date: '2026-04-10',
        time: 'amc',
        eps: 0.50, // -50% 서프라이즈 (예상보다 낮음)
        epsEstimated: 1.00,
        revenue: null,
        revenueEstimated: null,
      };

      const result = transformEarningsEvent(event);

      expect(result.impactScore).toBe(9); // 절댓값 50% > 20%
    });
  });

  describe('collectEarningsCalendar', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('성공적으로 실적 발표 일정 수집', async () => {
      const mockResponse = [
        {
          symbol: 'AAPL',
          date: '2026-03-18',
          time: 'amc',
          eps: 1.25,
          epsEstimated: 1.20,
          revenue: 95000000000,
          revenueEstimated: 94000000000,
        },
        {
          symbol: 'TSLA',
          date: '2026-03-20',
          time: 'amc',
          eps: 0.85,
          epsEstimated: 0.80,
          revenue: 22000000000,
          revenueEstimated: 21000000000,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await collectEarningsCalendar({
        fromDate: '2026-03-15',
        toDate: '2026-03-25',
      });

      expect(result.source).toBe('earnings-calendar');
      expect(result.eventsCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('API 요청 실패 시 에러 처리', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await collectEarningsCalendar({
        fromDate: '2026-03-15',
        toDate: '2026-03-25',
      });

      expect(result.source).toBe('earnings-calendar');
      expect(result.eventsCount).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('빈 결과 처리', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      const result = await collectEarningsCalendar({
        fromDate: '2026-03-15',
        toDate: '2026-03-25',
      });

      expect(result.source).toBe('earnings-calendar');
      expect(result.eventsCount).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
    });
  });
});
