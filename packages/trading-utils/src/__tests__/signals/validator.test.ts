import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  validateSignalPrices,
  validateConfidence,
  validateTechnicalData,
  validateSignal,
} from '../../signals/validator.js';
import type { SignalPrices, TechnicalSnapshot } from '../../signals/types.js';

describe('validateSignalPrices', () => {
  describe('매수 신호 검증', () => {
    it('유효한 매수 신호를 통과시켜야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(110),
        stopLoss: new Big(98),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.riskRewardRatio).not.toBeNull();
      expect(result.stopLossPct).not.toBeNull();
    });

    it('손절가가 진입가보다 높으면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(110),
        stopLoss: new Big(101),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('손절가');
    });

    it('목표가가 진입가보다 낮으면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(99),
        stopLoss: new Big(98),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('목표가');
    });

    it('손절 폭이 0.5% 미만이면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(110),
        stopLoss: new Big(99.8), // 0.2%
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('손절 폭이 너무 작습니다'))).toBe(true);
    });

    it('손절 폭이 5% 초과하면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(110),
        stopLoss: new Big(94), // 6%
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('손절 폭이 너무 큽니다'))).toBe(true);
    });

    it('R/R 비율이 1.5 미만이면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(102), // 2% 이익
        stopLoss: new Big(98), // 2% 손실 => R/R = 1.0
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('R/R 비율이 너무 낮습니다'))).toBe(true);
    });
  });

  describe('매도 신호 검증', () => {
    it('유효한 매도 신호를 통과시켜야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(90),
        stopLoss: new Big(102),
      };

      const result = validateSignalPrices(prices, 'SELL');

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('손절가가 진입가보다 낮으면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(90),
        stopLoss: new Big(99),
      };

      const result = validateSignalPrices(prices, 'SELL');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('손절가'))).toBe(true);
    });

    it('목표가가 진입가보다 높으면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(101),
        stopLoss: new Big(102),
      };

      const result = validateSignalPrices(prices, 'SELL');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('목표가'))).toBe(true);
    });
  });

  describe('가격 양수 검증', () => {
    it('진입가가 0 이하면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(0),
        target: new Big(110),
        stopLoss: new Big(98),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('진입가는 0보다 커야'))).toBe(true);
    });

    it('목표가가 0 이하면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(-10),
        stopLoss: new Big(98),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('목표가는 0보다 커야'))).toBe(true);
    });

    it('손절가가 0 이하면 실패해야 함', () => {
      const prices: SignalPrices = {
        entry: new Big(100),
        target: new Big(110),
        stopLoss: new Big(0),
      };

      const result = validateSignalPrices(prices, 'BUY');

      expect(result.valid).toBe(false);
      expect(result.violations.some((v) => v.includes('손절가는 0보다 커야'))).toBe(true);
    });
  });
});

describe('validateConfidence', () => {
  it('유효한 신뢰도를 통과시켜야 함', () => {
    const result = validateConfidence(0.75);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('신뢰도가 0.4 미만이면 실패해야 함', () => {
    const result = validateConfidence(0.3);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('신뢰도가 너무 낮습니다'))).toBe(true);
  });

  it('신뢰도가 1 초과하면 실패해야 함', () => {
    const result = validateConfidence(1.5);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('신뢰도가 범위를 초과'))).toBe(true);
  });

  it('최소 신뢰도(0.4)는 통과해야 함', () => {
    const result = validateConfidence(0.4);

    expect(result.valid).toBe(true);
  });

  it('최대 신뢰도(1.0)는 통과해야 함', () => {
    const result = validateConfidence(1.0);

    expect(result.valid).toBe(true);
  });
});

describe('validateTechnicalData', () => {
  it('충분한 지표가 있으면 통과해야 함', () => {
    const snapshot: TechnicalSnapshot = {
      sma20: new Big(100),
      ema20: new Big(101),
      macd: { value: 1.5, signal: 1.2, histogram: 0.3 },
      rsi: 55,
      volume: { current: new Big(1000000), avg: new Big(800000), ratio: 1.25 },
      supportResistance: [{ level: new Big(98), type: 'support', strength: 0.8 }],
      atr: new Big(2.5),
    };

    const result = validateTechnicalData(snapshot);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.availableIndicators.length).toBeGreaterThanOrEqual(3);
  });

  it('ATR이 없으면 실패해야 함', () => {
    const snapshot: TechnicalSnapshot = {
      sma20: new Big(100),
      ema20: new Big(101),
      macd: { value: 1.5, signal: 1.2, histogram: 0.3 },
      rsi: 55,
      volume: null,
      supportResistance: [],
      atr: null,
    };

    const result = validateTechnicalData(snapshot);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('ATR 데이터가 필요합니다'))).toBe(true);
  });

  it('지표가 3개 미만이면 실패해야 함', () => {
    const snapshot: TechnicalSnapshot = {
      sma20: new Big(100),
      ema20: null,
      macd: null,
      rsi: null,
      volume: null,
      supportResistance: [],
      atr: new Big(2.5),
    };

    const result = validateTechnicalData(snapshot);

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('기술적 지표가 부족합니다'))).toBe(true);
    expect(result.availableIndicators.length).toBeLessThan(3);
  });

  it('사용 가능한 지표 목록을 반환해야 함', () => {
    const snapshot: TechnicalSnapshot = {
      sma20: new Big(100),
      ema20: new Big(101),
      macd: null,
      rsi: 55,
      volume: null,
      supportResistance: [],
      atr: new Big(2.5),
    };

    const result = validateTechnicalData(snapshot);

    expect(result.availableIndicators).toContain('SMA20');
    expect(result.availableIndicators).toContain('EMA20');
    expect(result.availableIndicators).toContain('RSI');
    expect(result.availableIndicators).toContain('ATR');
    expect(result.availableIndicators).not.toContain('MACD');
    expect(result.availableIndicators).not.toContain('Volume');
  });
});

describe('validateSignal', () => {
  const validPrices: SignalPrices = {
    entry: new Big(100),
    target: new Big(110),
    stopLoss: new Big(98),
  };

  const validSnapshot: TechnicalSnapshot = {
    sma20: new Big(100),
    ema20: new Big(101),
    macd: { value: 1.5, signal: 1.2, histogram: 0.3 },
    rsi: 55,
    volume: { current: new Big(1000000), avg: new Big(800000), ratio: 1.25 },
    supportResistance: [{ level: new Big(98), type: 'support', strength: 0.8 }],
    atr: new Big(2.5),
  };

  it('모든 조건이 유효하면 통과해야 함', () => {
    const result = validateSignal({
      prices: validPrices,
      confidence: 0.75,
      direction: 'BUY',
      technicalSnapshot: validSnapshot,
    });

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.riskRewardRatio).not.toBeNull();
    expect(result.stopLossPct).not.toBeNull();
  });

  it('가격이 유효하지 않으면 실패해야 함', () => {
    const invalidPrices: SignalPrices = {
      entry: new Big(100),
      target: new Big(99), // 목표가가 진입가보다 낮음
      stopLoss: new Big(98),
    };

    const result = validateSignal({
      prices: invalidPrices,
      confidence: 0.75,
      direction: 'BUY',
      technicalSnapshot: validSnapshot,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('신뢰도가 유효하지 않으면 실패해야 함', () => {
    const result = validateSignal({
      prices: validPrices,
      confidence: 0.3, // 최소값(0.4) 미만
      direction: 'BUY',
      technicalSnapshot: validSnapshot,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('신뢰도'))).toBe(true);
  });

  it('기술적 데이터가 부족하면 실패해야 함', () => {
    const insufficientSnapshot: TechnicalSnapshot = {
      sma20: new Big(100),
      ema20: null,
      macd: null,
      rsi: null,
      volume: null,
      supportResistance: [],
      atr: null, // ATR 없음
    };

    const result = validateSignal({
      prices: validPrices,
      confidence: 0.75,
      direction: 'BUY',
      technicalSnapshot: insufficientSnapshot,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('여러 위반사항이 있으면 모두 포함해야 함', () => {
    const invalidPrices: SignalPrices = {
      entry: new Big(100),
      target: new Big(99),
      stopLoss: new Big(101),
    };

    const insufficientSnapshot: TechnicalSnapshot = {
      sma20: null,
      ema20: null,
      macd: null,
      rsi: null,
      volume: null,
      supportResistance: [],
      atr: null,
    };

    const result = validateSignal({
      prices: invalidPrices,
      confidence: 0.2,
      direction: 'BUY',
      technicalSnapshot: insufficientSnapshot,
    });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(3); // 가격 + 신뢰도 + 기술적 위반
  });
});
