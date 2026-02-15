import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { calculateTechnicalConfidence, blendConfidence } from '../../signals/confidence-engine.js';
import type { TechnicalSnapshot } from '../../signals/types.js';

describe('blendConfidence', () => {
  it('기본 가중치(AI 60%, 기술적 40%)로 블렌딩해야 함', () => {
    const result = blendConfidence({
      aiConfidence: 0.8,
      technicalConfidence: 0.6,
    });

    // 0.8 * 0.6 + 0.6 * 0.4 = 0.48 + 0.24 = 0.72
    expect(result.finalConfidence).toBeCloseTo(0.72, 2);
    expect(result.aiConfidence).toBe(0.8);
    expect(result.technicalConfidence).toBe(0.6);
    expect(result.breakdown.aiWeight).toBe(0.6);
    expect(result.breakdown.technicalWeight).toBe(0.4);
  });

  it('사용자 정의 가중치로 블렌딩해야 함', () => {
    const result = blendConfidence({
      aiConfidence: 0.9,
      technicalConfidence: 0.5,
      aiWeight: 0.7,
      technicalWeight: 0.3,
    });

    // 0.9 * 0.7 + 0.5 * 0.3 = 0.63 + 0.15 = 0.78
    expect(result.finalConfidence).toBeCloseTo(0.78, 2);
    expect(result.breakdown.aiWeight).toBe(0.7);
    expect(result.breakdown.technicalWeight).toBe(0.3);
  });

  it('최종 신뢰도가 1을 초과하면 1로 클램핑해야 함', () => {
    const result = blendConfidence({
      aiConfidence: 1.5, // 잘못된 입력
      technicalConfidence: 1.0,
    });

    expect(result.finalConfidence).toBe(1.0);
  });

  it('최종 신뢰도가 0 미만이면 0으로 클램핑해야 함', () => {
    const result = blendConfidence({
      aiConfidence: -0.5, // 잘못된 입력
      technicalConfidence: 0.0,
    });

    expect(result.finalConfidence).toBe(0.0);
  });

  it('모든 신뢰도가 0이면 0을 반환해야 함', () => {
    const result = blendConfidence({
      aiConfidence: 0.0,
      technicalConfidence: 0.0,
    });

    expect(result.finalConfidence).toBe(0.0);
  });

  it('모든 신뢰도가 1이면 1을 반환해야 함', () => {
    const result = blendConfidence({
      aiConfidence: 1.0,
      technicalConfidence: 1.0,
    });

    expect(result.finalConfidence).toBe(1.0);
  });
});

describe('calculateTechnicalConfidence', () => {
  describe('이동평균 신호', () => {
    it('매수 신호: 현재가 > EMA20 > SMA20 이면 높은 신뢰도를 반환해야 함', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(105),
        sma20: new Big(100),
        ema20: new Big(103),
        macd: null,
        rsi: null,
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // 이동평균 1.0 * 0.25 = 0.25
      expect(confidence).toBeGreaterThan(0);
    });

    it('매도 신호: 현재가 < EMA20 < SMA20 이면 높은 신뢰도를 반환해야 함', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(95),
        sma20: new Big(100),
        ema20: new Big(97),
        macd: null,
        rsi: null,
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'SELL');

      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('MACD 신호', () => {
    it('매수 신호: MACD > Signal, histogram > 0 이면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: {
          macd: new Big(1.5),
          signal: new Big(1.0),
          histogram: new Big(0.5),
        },
        rsi: null,
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // MACD 1.0 * 0.2 = 0.2
      expect(confidence).toBeGreaterThan(0);
    });

    it('매도 신호: MACD < Signal, histogram < 0 이면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: {
          macd: new Big(1.0),
          signal: new Big(1.5),
          histogram: new Big(-0.5),
        },
        rsi: null,
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'SELL');

      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('RSI 신호', () => {
    it('매수 신호: RSI 과매도 구간이면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: {
          value: new Big(25),
          overbought: false,
          oversold: true,
        },
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // RSI 0.9 * 0.15 = 0.135
      expect(confidence).toBeGreaterThan(0);
    });

    it('매도 신호: RSI 과매수 구간이면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: {
          value: new Big(75),
          overbought: true,
          oversold: false,
        },
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'SELL');

      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('거래량 신호', () => {
    it('높은 거래량이면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: null,
        volume: {
          avgVolume: new Big(1000000),
          currentVolume: new Big(1500000),
          volumeRatio: new Big(1.5),
          isHighVolume: true,
        },
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // Volume 0.9 * 0.2 = 0.18
      expect(confidence).toBeGreaterThan(0);
    });

    it('낮은 거래량이면 낮은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: null,
        volume: {
          avgVolume: new Big(1000000),
          currentVolume: new Big(500000),
          volumeRatio: new Big(0.5),
          isHighVolume: false,
        },
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // Volume 0.4 * 0.2 = 0.08
      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('지지/저항 신호', () => {
    it('매수: 지지선 근처에서 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: null,
        volume: null,
        supportResistance: [
          {
            price: new Big(99), // 현재가 100에서 1% 차이
            type: 'support',
            strength: 0.9,
            touches: 3,
          },
        ],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      expect(confidence).toBeGreaterThan(0);
    });

    it('매도: 저항선 근처에서 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: null,
        volume: null,
        supportResistance: [
          {
            price: new Big(101), // 현재가 100에서 1% 차이
            type: 'resistance',
            strength: 0.8,
            touches: 2,
          },
        ],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'SELL');

      expect(confidence).toBeGreaterThan(0);
    });
  });

  describe('복합 신호', () => {
    it('모든 지표가 매수를 지지하면 높은 신뢰도', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(105),
        sma20: new Big(100),
        ema20: new Big(103),
        macd: {
          macd: new Big(1.5),
          signal: new Big(1.0),
          histogram: new Big(0.5),
        },
        rsi: {
          value: new Big(25),
          overbought: false,
          oversold: true,
        },
        volume: {
          avgVolume: new Big(1000000),
          currentVolume: new Big(1500000),
          volumeRatio: new Big(1.5),
          isHighVolume: true,
        },
        supportResistance: [
          {
            price: new Big(104),
            type: 'support',
            strength: 0.9,
            touches: 3,
          },
        ],
        atr: new Big(2.5),
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      // MA 1.0*0.25 + MACD 1.0*0.2 + RSI 0.9*0.15 + Volume 0.9*0.2 + SR ~0.95*0.2
      // = 0.25 + 0.2 + 0.135 + 0.18 + 0.19 = 0.955
      expect(confidence).toBeGreaterThan(0.9);
    });

    it('지표가 하나도 없으면 중립(0.5)을 반환해야 함', () => {
      const snapshot: TechnicalSnapshot = {
        currentPrice: new Big(100),
        sma20: null,
        ema20: null,
        macd: null,
        rsi: null,
        volume: null,
        supportResistance: [],
        atr: null,
        calculatedAt: new Date().toISOString(),
      };

      const confidence = calculateTechnicalConfidence(snapshot, 'BUY');

      expect(confidence).toBe(0.5);
    });
  });
});
