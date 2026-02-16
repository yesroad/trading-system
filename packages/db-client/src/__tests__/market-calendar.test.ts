import { describe, it, expect } from 'vitest';
import { getRecommendation } from '../market-calendar.js';

describe('Market Calendar - DB Client', () => {
  describe('getRecommendation', () => {
    it('low 리스크는 proceed 반환', () => {
      const result = getRecommendation('low');
      expect(result).toBe('proceed');
    });

    it('medium 리스크는 reduce_size 반환', () => {
      const result = getRecommendation('medium');
      expect(result).toBe('reduce_size');
    });

    it('high 리스크는 block 반환', () => {
      const result = getRecommendation('high');
      expect(result).toBe('block');
    });
  });

  // Note: buildMarketContext, checkEventRisk, getUpcomingHighImpactEvents 등은
  // DB 의존성이 있어서 통합 테스트에서 테스트합니다.
});
