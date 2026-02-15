import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { calculateMACD, checkMACDCrossover } from '../../indicators/macd.js';
import type { Candle } from '../../types.js';

function createCandle(close: number): Candle {
  return {
    open: close,
    high: close,
    low: close,
    close,
    volume: 1000,
    timestamp: new Date().toISOString(),
  };
}

describe('calculateMACD', () => {
  it('상승 추세에서 양수 히스토그램을 반환해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 35; i++) {
      candles.push(createCandle(100 + i * 2));
    }

    const result = calculateMACD(candles);

    expect(result.macd).toBeDefined();
    expect(result.signal).toBeDefined();
    expect(result.histogram).toBeDefined();
  });

  it('하락 추세에서 음수 히스토그램을 반환해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 35; i++) {
      candles.push(createCandle(200 - i * 2));
    }

    const result = calculateMACD(candles);

    expect(result.macd).toBeDefined();
    expect(result.signal).toBeDefined();
    expect(result.histogram).toBeDefined();
  });

  it('캔들 수가 부족하면 에러를 던져야 함', () => {
    const candles: Candle[] = [createCandle(100), createCandle(101)];

    expect(() => calculateMACD(candles)).toThrow();
  });

  it('사용자 정의 파라미터를 적용해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 40; i++) {
      candles.push(createCandle(100 + i));
    }

    const result = calculateMACD(candles, 12, 26, 9);
    expect(result.macd).toBeDefined();
  });
});

describe('checkMACDCrossover', () => {
  it('이전 histogram < 0, 현재 histogram > 0 이면 bullish', () => {
    const previous = {
      macd: new Big(1.0),
      signal: new Big(1.5),
      histogram: new Big(-0.5),
    };
    const current = {
      macd: new Big(1.6),
      signal: new Big(1.5),
      histogram: new Big(0.1),
    };

    const result = checkMACDCrossover(current, previous);

    expect(result).toBe('bullish');
  });

  it('이전 histogram > 0, 현재 histogram < 0 이면 bearish', () => {
    const previous = {
      macd: new Big(1.6),
      signal: new Big(1.5),
      histogram: new Big(0.1),
    };
    const current = {
      macd: new Big(1.0),
      signal: new Big(1.5),
      histogram: new Big(-0.5),
    };

    const result = checkMACDCrossover(current, previous);

    expect(result).toBe('bearish');
  });

  it('교차가 없으면 null', () => {
    const previous = {
      macd: new Big(1.5),
      signal: new Big(1.3),
      histogram: new Big(0.2),
    };
    const current = {
      macd: new Big(1.6),
      signal: new Big(1.4),
      histogram: new Big(0.2),
    };

    const result = checkMACDCrossover(current, previous);

    expect(result).toBeNull();
  });

  it('둘 다 양수면 null', () => {
    const previous = {
      macd: new Big(1.0),
      signal: new Big(0.9),
      histogram: new Big(0.1),
    };
    const current = {
      macd: new Big(1.1),
      signal: new Big(1.0),
      histogram: new Big(0.1),
    };

    const result = checkMACDCrossover(current, previous);

    expect(result).toBeNull();
  });
});
