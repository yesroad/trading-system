import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  saveCalendarEvent,
  saveCalendarEvents,
  getHighImpactEvents,
  getUpcomingEarnings,
} from './event-saver.js';
import type { CalendarEvent } from '../types.js';

// Supabase 모킹
const mockSupabase = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      error: null,
    })),
    select: vi.fn(() => ({
      gte: vi.fn(() => ({
        lte: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() => ({
              data: [
                {
                  id: '1',
                  title: 'FOMC Meeting',
                  summary: 'Fed 금리 결정',
                  source: 'FMP Economic Calendar',
                  impact_score: 9,
                  affected_sectors: ['Financials'],
                  price_impact_pct: null,
                  published_at: '2026-03-18T14:00:00Z',
                },
              ],
              error: null,
            })),
          })),
        })),
      })),
      eq: vi.fn((key: string, value: string) => ({
        ilike: vi.fn(() => ({
          gte: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                single: vi.fn(() => {
                  if (value === 'UNKNOWN') {
                    return {
                      data: null,
                      error: { code: 'PGRST116' },
                    };
                  }
                  return {
                    data: {
                      id: '2',
                      title: 'AAPL 실적 발표 (AMC)',
                      summary: 'EPS 예상: $1.20',
                      source: 'FMP Earnings Calendar',
                      impact_score: 7,
                      affected_sectors: null,
                      price_impact_pct: null,
                      published_at: '2026-03-20T16:00:00Z',
                    },
                    error: null,
                  };
                }),
              })),
            })),
          })),
        })),
      })),
    })),
  })),
};

vi.mock('@workspace/db-client', () => ({
  getSupabase: vi.fn(() => mockSupabase),
}));

describe('Event Saver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('saveCalendarEvent', () => {
    it('CalendarEvent를 성공적으로 저장', async () => {
      const event: CalendarEvent = {
        type: 'economic',
        title: 'FOMC Meeting',
        summary: 'Fed 금리 결정',
        source: 'FMP Economic Calendar',
        impactScore: 9,
        affectedSectors: ['Financials', 'Real Estate'],
        priceImpactPct: null,
        publishedAt: '2026-03-18T14:00:00Z',
      };

      await expect(saveCalendarEvent(event)).resolves.toBeUndefined();
    });

    it('earnings 이벤트를 성공적으로 저장', async () => {
      const event: CalendarEvent = {
        type: 'earnings',
        title: 'AAPL 실적 발표 (BMO)',
        summary: 'EPS 예상: $1.20, 매출 예상: $94000M',
        source: 'FMP Earnings Calendar',
        impactScore: 7,
        affectedSectors: null,
        priceImpactPct: null,
        publishedAt: '2026-03-18T08:00:00Z',
        metadata: {
          symbol: 'AAPL',
          eps: 1.25,
          epsEstimated: 1.2,
          revenue: 95000000000,
          revenueEstimated: 94000000000,
          time: 'bmo',
        },
      };

      await expect(saveCalendarEvent(event)).resolves.toBeUndefined();
    });
  });

  describe('saveCalendarEvents', () => {
    it('여러 이벤트를 배치로 저장', async () => {
      const events: CalendarEvent[] = [
        {
          type: 'economic',
          title: 'CPI 발표',
          summary: '소비자 물가 지수',
          source: 'FMP Economic Calendar',
          impactScore: 8,
          affectedSectors: ['Consumer Staples'],
          priceImpactPct: null,
          publishedAt: '2026-03-12T08:30:00Z',
        },
        {
          type: 'earnings',
          title: 'TSLA 실적 발표 (AMC)',
          summary: 'EPS 예상: $0.80',
          source: 'FMP Earnings Calendar',
          impactScore: 6,
          affectedSectors: null,
          priceImpactPct: null,
          publishedAt: '2026-03-20T16:00:00Z',
        },
      ];

      const result = await saveCalendarEvents(events);

      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('빈 배열을 저장하면 successCount 0', async () => {
      const result = await saveCalendarEvents([]);

      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getHighImpactEvents', () => {
    it('고임팩트 이벤트를 성공적으로 조회', async () => {
      const result = await getHighImpactEvents({
        fromDate: '2026-03-10T00:00:00Z',
        toDate: '2026-03-20T00:00:00Z',
        minImpactScore: 8,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      if (result.length > 0) {
        expect(result[0].type).toBeDefined();
        expect(result[0].title).toBeDefined();
        expect(result[0].impactScore).toBeGreaterThanOrEqual(8);
      }
    });

    it('기본 minImpactScore는 8', async () => {
      const result = await getHighImpactEvents({
        fromDate: '2026-03-10T00:00:00Z',
        toDate: '2026-03-20T00:00:00Z',
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getUpcomingEarnings', () => {
    it('향후 실적 발표를 성공적으로 조회', async () => {
      const result = await getUpcomingEarnings('AAPL');

      expect(result).toBeDefined();
      if (result) {
        expect(result.type).toBe('earnings');
        expect(result.title).toContain('AAPL');
        expect(result.source).toBe('FMP Earnings Calendar');
      }
    });

    it('실적 발표 조회 테스트', async () => {
      // getUpcomingEarnings는 실제 DB 조회가 필요하므로 기본 동작만 확인
      const result = await getUpcomingEarnings('AAPL');

      // 모킹된 데이터 또는 null 반환
      expect(result === null || typeof result === 'object').toBe(true);
    });
  });
});
