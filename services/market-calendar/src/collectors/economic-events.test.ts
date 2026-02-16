import { describe, it, expect } from 'vitest';
import { transformEconomicEvent } from './economic-events.js';
import type { EconomicEvent } from '../types.js';

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
});
