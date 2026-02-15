import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { calculateRSI, checkRSIDivergence } from '../../indicators/rsi.js';
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

describe('calculateRSI', () => {
  it('상승 추세에서 높은 RSI를 반환해야 함', () => {
    const candles: Candle[] = [];
    // 가격이 지속적으로 상승
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100 + i * 2));
    }

    const result = calculateRSI(candles, 14);

    expect(result.value.toNumber()).toBeGreaterThan(50);
    expect(result.value.toNumber()).toBeLessThanOrEqual(100);
  });

  it('하락 추세에서 낮은 RSI를 반환해야 함', () => {
    const candles: Candle[] = [];
    // 가격이 지속적으로 하락
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(200 - i * 2));
    }

    const result = calculateRSI(candles, 14);

    expect(result.value.toNumber()).toBeLessThan(50);
    expect(result.value.toNumber()).toBeGreaterThanOrEqual(0);
  });

  it('RSI가 70 이상이면 overbought여야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100 + i * 5));
    }

    const result = calculateRSI(candles, 14);

    if (result.value.toNumber() > 70) {
      expect(result.overbought).toBe(true);
      expect(result.oversold).toBe(false);
    }
  });

  it('RSI가 30 이하이면 oversold여야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(200 - i * 5));
    }

    const result = calculateRSI(candles, 14);

    if (result.value.toNumber() < 30) {
      expect(result.oversold).toBe(true);
      expect(result.overbought).toBe(false);
    }
  });

  it('캔들 수가 부족하면 에러를 던져야 함', () => {
    const candles: Candle[] = [
      createCandle(100),
      createCandle(101),
    ];

    expect(() => calculateRSI(candles, 14)).toThrow('RSI 계산에 최소 15개의 캔들이 필요');
  });

  it('사용자 정의 period를 적용해야 함', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) {
      candles.push(createCandle(100 + i));
    }

    const result = calculateRSI(candles, 10);
    expect(result.value).toBeDefined();
  });
});

describe('checkRSIDivergence', () => {
  it('가격 하락 + RSI 상승 = bullish divergence', () => {
    const prices: [Big, Big] = [new Big(110), new Big(100)]; // 가격 하락
    const rsiValues: [Big, Big] = [new Big(30), new Big(35)]; // RSI 상승

    const result = checkRSIDivergence(prices, rsiValues);

    expect(result).toBe('bullish');
  });

  it('가격 상승 + RSI 하락 = bearish divergence', () => {
    const prices: [Big, Big] = [new Big(100), new Big(110)]; // 가격 상승
    const rsiValues: [Big, Big] = [new Big(70), new Big(65)]; // RSI 하락

    const result = checkRSIDivergence(prices, rsiValues);

    expect(result).toBe('bearish');
  });

  it('가격과 RSI가 같은 방향이면 null', () => {
    const prices: [Big, Big] = [new Big(100), new Big(110)]; // 가격 상승
    const rsiValues: [Big, Big] = [new Big(50), new Big(60)]; // RSI도 상승

    const result = checkRSIDivergence(prices, rsiValues);

    expect(result).toBeNull();
  });

  it('가격 변화 없으면 null', () => {
    const prices: [Big, Big] = [new Big(100), new Big(100)];
    const rsiValues: [Big, Big] = [new Big(50), new Big(60)];

    const result = checkRSIDivergence(prices, rsiValues);

    expect(result).toBeNull();
  });
});
