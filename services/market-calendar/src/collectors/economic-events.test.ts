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
        estimate: '5.25',
        previous: '5.00',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.type).toBe('economic');
      expect(result.title).toBe('FOMC Meeting (US)');
      expect(result.impactScore).toBe(9); // High = 9
      expect(result.summary).toContain('예상: 5.25');
      expect(result.summary).toContain('이전: 5.00');
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
        estimate: '0.5',
        previous: '0.3',
        actual: '0.6',
      };

      const result = transformEconomicEvent(event);

      expect(result.impactScore).toBe(6); // Medium = 6
      expect(result.summary).toContain('예상: 0.5');
      expect(result.summary).toContain('이전: 0.3');
      expect(result.summary).toContain('실제: 0.6');
    });

    it('Low impact 이벤트를 올바르게 변환', () => {
      const event: EconomicEvent = {
        event: 'Building Permits',
        country: 'US',
        currency: 'USD',
        date: '2026-03-20T08:30:00Z',
        impact: 'Low',
        estimate: null,
        previous: null,
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.impactScore).toBe(3); // Low = 3
      expect(result.summary).toBe('Building Permits 발표 예정');
    });

    it('FOMC 이벤트는 금융/부동산/유틸리티/기술/소비재 섹터에 영향', () => {
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
      expect(result.affectedSectors).toContain('Technology');
      expect(result.affectedSectors?.length).toBeGreaterThan(3);
    });

    it('CPI 이벤트는 소비재/에너지 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Consumer Price Index (CPI)',
        country: 'US',
        currency: 'USD',
        date: '2026-03-12T08:30:00Z',
        impact: 'High',
        estimate: '3.2',
        previous: '3.1',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Consumer Staples');
      expect(result.affectedSectors).toContain('Consumer Discretionary');
      expect(result.affectedSectors).toContain('Energy');
    });

    it('NFP 이벤트는 소비재/금융/산업재 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Nonfarm Payrolls (NFP)',
        country: 'US',
        currency: 'USD',
        date: '2026-03-07T08:30:00Z',
        impact: 'High',
        estimate: '200K',
        previous: '180K',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Consumer Discretionary');
      expect(result.affectedSectors).toContain('Financials');
      expect(result.affectedSectors).toContain('Industrials');
    });

    it('GDP 이벤트는 금융/기술/산업재/소비재 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'GDP Growth Rate',
        country: 'US',
        currency: 'USD',
        date: '2026-03-28T08:30:00Z',
        impact: 'High',
        estimate: '2.5',
        previous: '2.3',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Financials');
      expect(result.affectedSectors).toContain('Technology');
      expect(result.affectedSectors).toContain('Industrials');
    });

    it('Retail Sales 이벤트는 소비재 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Retail Sales MoM',
        country: 'US',
        currency: 'USD',
        date: '2026-03-15T08:30:00Z',
        impact: 'Medium',
        estimate: '0.5',
        previous: '0.3',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Consumer Discretionary');
      expect(result.affectedSectors).toContain('Consumer Staples');
    });

    it('PMI 이벤트는 산업재/소재 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Manufacturing PMI',
        country: 'US',
        currency: 'USD',
        date: '2026-03-01T09:45:00Z',
        impact: 'Medium',
        estimate: '52.5',
        previous: '52.0',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Industrials');
      expect(result.affectedSectors).toContain('Materials');
    });

    it('Housing 이벤트는 부동산/금융/소재 섹터에 영향', () => {
      const event: EconomicEvent = {
        event: 'Housing Starts',
        country: 'US',
        currency: 'USD',
        date: '2026-03-17T08:30:00Z',
        impact: 'Medium',
        estimate: '1.5M',
        previous: '1.4M',
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toContain('Real Estate');
      expect(result.affectedSectors).toContain('Financials');
      expect(result.affectedSectors).toContain('Materials');
    });

    it('알 수 없는 이벤트는 빈 섹터 배열 반환', () => {
      const event: EconomicEvent = {
        event: 'Unknown Economic Indicator',
        country: 'US',
        currency: 'USD',
        date: '2026-03-20T08:30:00Z',
        impact: 'Low',
        estimate: null,
        previous: null,
        actual: null,
      };

      const result = transformEconomicEvent(event);

      expect(result.affectedSectors).toEqual([]);
    });

    it('메타데이터를 올바르게 포함', () => {
      const event: EconomicEvent = {
        event: 'Test Event',
        country: 'US',
        currency: 'USD',
        date: '2026-03-20T08:30:00Z',
        impact: 'Medium',
        estimate: '1.5',
        previous: '1.3',
        actual: '1.6',
      };

      const result = transformEconomicEvent(event);

      expect(result.metadata).toEqual({
        country: 'US',
        currency: 'USD',
        previous: '1.3',
        estimate: '1.5',
        actual: '1.6',
        impact: 'Medium',
      });
    });
  });
});
