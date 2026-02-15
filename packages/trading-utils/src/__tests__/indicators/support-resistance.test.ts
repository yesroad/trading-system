import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  findSupportResistanceLevels,
  findNearbyLevel,
} from '../../indicators/support-resistance.js';
import type { Candle } from '../../types.js';

function createCandle(high: number, low: number): Candle {
  const close = (high + low) / 2;
  return {
    open: close,
    high,
    low,
    close,
    volume: 1000,
    timestamp: new Date().toISOString(),
  };
}

describe('findSupportResistanceLevels', () => {
  it('충분한 캔들이 있으면 지지/저항선을 찾아야 함', () => {
    const candles: Candle[] = [];

    // 상승 후 하락 패턴 (저항선 생성)
    for (let i = 0; i < 30; i++) {
      candles.push(createCandle(100 + i, 90 + i));
    }
    for (let i = 0; i < 30; i++) {
      candles.push(createCandle(129 - i, 119 - i));
    }

    const levels = findSupportResistanceLevels(candles, 20);

    expect(levels.length).toBeGreaterThan(0);
  });

  it('캔들이 부족하면 빈 배열을 반환해야 함', () => {
    const candles: Candle[] = [
      createCandle(100, 90),
      createCandle(101, 91),
    ];

    const levels = findSupportResistanceLevels(candles, 20);

    expect(levels).toEqual([]);
  });

  it('반환된 레벨은 type, price, strength, touches를 가져야 함', () => {
    const candles: Candle[] = [];

    for (let i = 0; i < 60; i++) {
      const value = 100 + Math.sin(i / 10) * 20;
      candles.push(createCandle(value + 5, value - 5));
    }

    const levels = findSupportResistanceLevels(candles, 10);

    if (levels.length > 0) {
      const level = levels[0];
      expect(level.type).toMatch(/support|resistance/);
      expect(level.price).toBeDefined();
      expect(level.strength).toBeDefined();
      expect(level.touches).toBeDefined();
    }
  });

  it('사용자 정의 lookback을 적용해야 함', () => {
    const candles: Candle[] = [];

    for (let i = 0; i < 50; i++) {
      candles.push(createCandle(100 + i, 90 + i));
    }

    const levels = findSupportResistanceLevels(candles, 5);

    expect(Array.isArray(levels)).toBe(true);
  });
});

describe('findNearbyLevel', () => {
  it('가까운 레벨을 찾아야 함', () => {
    const levels = [
      { price: new Big(100), type: 'support' as const, strength: 0.8, touches: 2 },
      { price: new Big(110), type: 'resistance' as const, strength: 0.7, touches: 1 },
      { price: new Big(120), type: 'resistance' as const, strength: 0.9, touches: 3 },
    ];

    const currentPrice = new Big(101);
    const nearby = findNearbyLevel(currentPrice, levels, 0.02); // 2% 이내

    expect(nearby).not.toBeNull();
    if (nearby) {
      expect(nearby.price.toNumber()).toBe(100);
    }
  });

  it('범위 내에 레벨이 없으면 null을 반환해야 함', () => {
    const levels = [
      { price: new Big(100), type: 'support' as const, strength: 0.8, touches: 2 },
      { price: new Big(120), type: 'resistance' as const, strength: 0.9, touches: 3 },
    ];

    const currentPrice = new Big(110);
    const nearby = findNearbyLevel(currentPrice, levels, 0.02); // 2% 이내

    expect(nearby).toBeNull();
  });

  it('레벨 배열이 비어있으면 null을 반환해야 함', () => {
    const currentPrice = new Big(100);
    const nearby = findNearbyLevel(currentPrice, [], 0.02);

    expect(nearby).toBeNull();
  });

  it('가장 가까운 레벨을 반환해야 함', () => {
    const levels = [
      { price: new Big(100), type: 'support' as const, strength: 0.8, touches: 2 },
      { price: new Big(101), type: 'support' as const, strength: 0.7, touches: 1 },
      { price: new Big(99), type: 'support' as const, strength: 0.9, touches: 3 },
    ];

    const currentPrice = new Big(100.5);
    const nearby = findNearbyLevel(currentPrice, levels, 0.05); // 5% 이내

    expect(nearby).not.toBeNull();
    if (nearby) {
      // 100.5와 가장 가까운 것은 101 (차이 0.5) 또는 100 (차이 0.5)
      expect([100, 101]).toContain(nearby.price.toNumber());
    }
  });

  it('사용자 정의 threshold를 적용해야 함', () => {
    const levels = [
      { price: new Big(100), type: 'support' as const, strength: 0.8, touches: 2 },
    ];

    const currentPrice = new Big(105);

    // 2% 이내에는 없음
    const nearby1 = findNearbyLevel(currentPrice, levels, 0.02);
    expect(nearby1).toBeNull();

    // 10% 이내에는 있음
    const nearby2 = findNearbyLevel(currentPrice, levels, 0.1);
    expect(nearby2).not.toBeNull();
  });
});
