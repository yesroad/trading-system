import { describe, it, expect, vi, beforeEach } from 'vitest';
import { transformEconomicEvent, collectEconomicEvents } from './economic-events.js';
import type { EconomicEvent } from '../types.js';

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

describe('Economic Events Collector', () => {
  describe('transformEconomicEvent', () => {
    it('High impact 이벤트를 올바르게 변환', () => {
      const event: EconomicEvent = {
        event: 'FOMC Meeting',
        country: 'US',
        currency: 'USD',
        date: '2026-03-18T14:00:00Z',
        impact: 'High',
        estimate: 5.25,
        previous: 5.00,
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.type).toBe('economic');
      expect(result.title).toBe('FOMC Meeting (US)');
      expect(result.impactScore).toBe(9); // High = 9
      expect(result.summary).toContain('예상: 5.25');
      expect(result.summary).toContain('이전: 5');
      expect(result.source).toBe('FMP Economic Calendar');
      expect(result.publishedAt).toBe('2026-03-18T14:00:00Z');
    });

    it('Medium impact 이벤트를 올바르게 변환', () => {
      const event: EconomicEvent = {
        event: 'Retail Sales',
        country: 'US',
        currency: 'USD',
        date: '2026-03-15T08:30:00Z',
        impact: 'Medium',
        estimate: 0.5,
        previous: 0.3,
        actual: 0.6,
      };

      const result = transformEconomicEvent(event);

      expect(result.impactScore).toBe(6); // Medium = 6
      expect(result.summary).toContain('예상: 0.5');
      expect(result.summary).toContain('이전: 0.3');
      expect(result.summary).toContain('실제: 0.6');
    });

    it('FOMC 이벤트는 여러 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'FOMC Press Conference',
        country: 'US',
        currency: 'USD',
        date: '2026-03-18T14:30:00Z',
        impact: 'High',
        estimate: null,
        previous: null,
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Financials');
      expect(result.affectedSectors).toContain('Real Estate');
      expect(result.affectedSectors?.length).toBeGreaterThan(3);
    });

    it('CPI 이벤트는 소비재/에너지 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Consumer Price Index (CPI)',
        country: 'US',
        currency: 'USD',
        date: '2026-03-12T08:30:00Z',
        impact: 'High',
        estimate: 3.2,
        previous: 3.1,
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Consumer Staples');
      expect(result.affectedSectors).toContain('Energy');
    });
  });

  describe('collectEconomicEvents', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('성공적으로 경제 이벤트 수집', async () => {
      const mockResponse = [
        {
          event: 'FOMC Meeting',
          country: 'US',
          currency: 'USD',
          date: '2026-03-18T14:00:00Z',
          impact: 'High',
          estimate: 5.25,
          previous: 5.00,
          actual: null,
        },
        {
          event: 'CPI',
          country: 'US',
          currency: 'USD',
          date: '2026-03-12T08:30:00Z',
          impact: 'High',
          estimate: 3.2,
          previous: 3.1,
          actual: null,
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await collectEconomicEvents({
        fromDate: '2026-03-10',
        toDate: '2026-03-20',
      });

      expect(result.source).toBe('economic-events');
      expect(result.eventsCount).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('API 요청 실패 시 에러 처리', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await collectEconomicEvents({
        fromDate: '2026-03-10',
        toDate: '2026-03-20',
      });

      expect(result.source).toBe('economic-events');
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

      const result = await collectEconomicEvents({
        fromDate: '2026-03-10',
        toDate: '2026-03-20',
      });

      expect(result.source).toBe('economic-events');
      expect(result.eventsCount).toBe(0);
      expect(result.successCount).toBe(0);
      expect(result.errorCount).toBe(0);
    });
  });
});
