import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  calculateMA,
  calculateMultipleMA,
  isPriceAboveMA,
  checkMACrossover,
} from '../../indicators/ma.js';
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

describe('calculateMA', () => {
  it('SMA를 올바르게 계산해야 함', () => {
    const candles: Candle[] = [
      createCandle(100),
      createCandle(110),
      createCandle(120),
      createCandle(130),
      createCandle(140),
    ];

    const ma = calculateMA(candles, 5, 'SMA');

    // (100 + 110 + 120 + 130 + 140) / 5 = 120
    expect(ma.toNumber()).toBe(120);
  });

  it('EMA를 계산해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100 + i));
    }

    const ma = calculateMA(candles, 10, 'EMA');

    expect(ma).toBeDefined();
    expect(ma.toNumber()).toBeGreaterThan(0);
  });

  it('캔들 수가 부족하면 에러를 던져야 함', () => {
    const candles: Candle[] = [createCandle(100), createCandle(110)];

    expect(() => calculateMA(candles, 5, 'SMA')).toThrow();
  });

  it('기본값은 SMA여야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) {
      candles.push(createCandle(100 + i * 10));
    }

    const ma = calculateMA(candles, 5);
    expect(ma).toBeDefined();
  });

  it('WMA를 계산해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      candles.push(createCandle(100 + i * 5));
    }

    const ma = calculateMA(candles, 10, 'WMA');
    expect(ma).toBeDefined();
    expect(ma.toNumber()).toBeGreaterThan(0);
  });

  it('지원하지 않는 타입이면 에러를 던져야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 10; i++) {
      candles.push(createCandle(100 + i));
    }

    expect(() => calculateMA(candles, 5, 'INVALID' as any)).toThrow('지원하지 않는 이동평균 타입');
  });
});

describe('calculateMultipleMA', () => {
  it('여러 이동평균을 계산해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 50; i++) {
      candles.push(createCandle(100 + i));
    }

    const result = calculateMultipleMA(candles, [5, 20, 50], 'SMA');

    expect(result[5]).toBeDefined();
    expect(result[20]).toBeDefined();
    expect(result[50]).toBeDefined();
  });

  it('단일 기간도 처리해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100 + i));
    }

    const result = calculateMultipleMA(candles, [10], 'SMA');

    expect(result[10]).toBeDefined();
  });

  it('EMA 타입으로 계산해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 30; i++) {
      candles.push(createCandle(100 + i));
    }

    const result = calculateMultipleMA(candles, [10, 20], 'EMA');

    expect(result[10]).toBeDefined();
    expect(result[20]).toBeDefined();
  });
});

describe('isPriceAboveMA', () => {
  it('가격이 MA 위에 있으면 true', () => {
    const result = isPriceAboveMA(new Big(110), new Big(100));
    expect(result).toBe(true);
  });

  it('가격이 MA 아래에 있으면 false', () => {
    const result = isPriceAboveMA(new Big(90), new Big(100));
    expect(result).toBe(false);
  });

  it('가격이 MA와 같으면 false', () => {
    const result = isPriceAboveMA(new Big(100), new Big(100));
    expect(result).toBe(false);
  });
});

describe('checkMACrossover', () => {
  it('단기선이 장기선 위에 있으면 golden', () => {
    const shortMA = new Big(110);
    const longMA = new Big(100);

    const result = checkMACrossover(shortMA, longMA);

    expect(result).toBe('golden');
  });

  it('단기선이 장기선 아래에 있으면 death', () => {
    const shortMA = new Big(90);
    const longMA = new Big(100);

    const result = checkMACrossover(shortMA, longMA);

    expect(result).toBe('death');
  });

  it('단기선과 장기선이 같으면 null', () => {
    const shortMA = new Big(100);
    const longMA = new Big(100);

    const result = checkMACrossover(shortMA, longMA);

    expect(result).toBeNull();
  });
});
