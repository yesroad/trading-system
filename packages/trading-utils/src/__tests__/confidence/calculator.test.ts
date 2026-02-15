import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  calculateWeightedConfidence,
  calculateMultiTimeframeConfidence,
  calculateVolatilityAdjustment,
  calculateTrendStrengthAdjustment,
  calculateFinalConfidence,
  calculateBasicConfidence,
} from '../../confidence/calculator.js';
import type { IndicatorScore } from '../../types.js';

describe('Confidence Calculator', () => {
  describe('calculateWeightedConfidence', () => {
    it('정상: 가중 평균을 계산해야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.8, weight: 0.5 },
        { name: 'RSI', score: 0.6, weight: 0.5 },
      ];

      const confidence = calculateWeightedConfidence(scores);

      // (0.8 * 0.5) + (0.6 * 0.5) = 0.7
      expect(confidence).toBe(0.7);
    });

    it('정상: 5개 지표로 계산해야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.8, weight: 0.25 },
        { name: 'MACD', score: 0.7, weight: 0.20 },
        { name: 'RSI', score: 0.6, weight: 0.15 },
        { name: 'Volume', score: 0.9, weight: 0.20 },
        { name: 'S/R', score: 0.5, weight: 0.20 },
      ];

      const confidence = calculateWeightedConfidence(scores);

      // 0.8*0.25 + 0.7*0.2 + 0.6*0.15 + 0.9*0.2 + 0.5*0.2 = 0.71
      expect(confidence.toFixed(2)).toBe('0.71');
    });

    it('에러: 가중치 합이 1.0이 아니면 에러', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.8, weight: 0.6 },
        { name: 'RSI', score: 0.6, weight: 0.3 }, // 합 0.9
      ];

      expect(() => calculateWeightedConfidence(scores)).toThrow('가중치 합이 1.0이 아닙니다');
    });

    it('경계: 0-1 범위로 제한되어야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 1.5, weight: 1.0 }, // 1.0 초과
      ];

      const confidence = calculateWeightedConfidence(scores);

      expect(confidence).toBe(1.0);
    });
  });

  describe('calculateMultiTimeframeConfidence', () => {
    it('정상: 여러 시간대의 평균을 계산해야 함', () => {
      const confidence = calculateMultiTimeframeConfidence({
        '1h': 0.8,
        '4h': 0.6,
        '1d': 1.0,
      });

      // (0.8 + 0.6 + 1.0) / 3 = 0.8
      expect(confidence.toFixed(2)).toBe('0.80');
    });

    it('경계: 빈 객체면 0을 반환해야 함', () => {
      const confidence = calculateMultiTimeframeConfidence({});

      expect(confidence).toBe(0);
    });
  });

  describe('calculateVolatilityAdjustment', () => {
    it('정상: ATR 2% 이하면 조정 없음 (1.0)', () => {
      const adjustment = calculateVolatilityAdjustment(new Big(0.02));

      expect(adjustment).toBe(1.0);
    });

    it('정상: ATR 10% 이상이면 최대 감소 (0.5)', () => {
      const adjustment = calculateVolatilityAdjustment(new Big(0.10));

      expect(adjustment).toBe(0.5);
    });

    it('정상: ATR 6%면 중간값', () => {
      const adjustment = calculateVolatilityAdjustment(new Big(0.06));

      // (0.06 - 0.02) / (0.10 - 0.02) = 0.5
      // 1.0 - (0.5 * 0.5) = 0.75
      expect(adjustment).toBe(0.75);
    });
  });

  describe('calculateTrendStrengthAdjustment', () => {
    it('정상: MA 거리 5% 이상이면 조정 없음 (1.0)', () => {
      const shortMA = new Big(105000);
      const longMA = new Big(100000); // 5% 차이

      const adjustment = calculateTrendStrengthAdjustment(shortMA, longMA);

      expect(adjustment).toBe(1.0);
    });

    it('정상: MA 거리 0%면 감소 (0.8)', () => {
      const shortMA = new Big(100000);
      const longMA = new Big(100000); // 0% 차이

      const adjustment = calculateTrendStrengthAdjustment(shortMA, longMA);

      expect(adjustment).toBe(0.8);
    });

    it('정상: MA 거리 2.5%면 중간값', () => {
      const shortMA = new Big(102500);
      const longMA = new Big(100000); // 2.5% 차이

      const adjustment = calculateTrendStrengthAdjustment(shortMA, longMA);

      // 0.8 + (0.025 / 0.05) * 0.2 = 0.8 + 0.1 = 0.9
      expect(adjustment).toBe(0.9);
    });
  });

  describe('calculateFinalConfidence', () => {
    it('정상: 조정 계수를 적용해야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.8, weight: 1.0 },
      ];

      const result = calculateFinalConfidence(scores, {
        volatilityFactor: 0.9,
        trendStrength: 0.95,
        volumeConfirmation: 1.0,
      });

      expect(result.rawConfidence).toBe(0.8);
      // 0.8 * 0.9 * 0.95 * 1.0 = 0.684
      expect(result.adjustedConfidence.toFixed(3)).toBe('0.684');
    });

    it('정상: breakdown을 반환해야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.8, weight: 1.0 },
      ];

      const result = calculateFinalConfidence(scores, {
        volatilityFactor: 1.0,
        trendStrength: 1.0,
        volumeConfirmation: 1.0,
      });

      expect(result.breakdown).toEqual(scores);
      expect(result.adjustments.volatilityFactor).toBe(1.0);
    });
  });

  describe('calculateBasicConfidence', () => {
    it('정상: 조정 없이 원본 신뢰도만 반환해야 함', () => {
      const scores: IndicatorScore[] = [
        { name: 'MA', score: 0.7, weight: 1.0 },
      ];

      const result = calculateBasicConfidence(scores);

      expect(result.rawConfidence).toBe(0.7);
      expect(result.adjustedConfidence).toBe(0.7);
      expect(result.adjustments.volatilityFactor).toBe(1.0);
      expect(result.adjustments.trendStrength).toBe(1.0);
      expect(result.adjustments.volumeConfirmation).toBe(1.0);
    });
  });
});
