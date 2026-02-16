import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { SimpleMAStrategy } from './simple-ma-crossover.js';
import type { Candle } from '../types.js';

describe('Simple MA Crossover 전략', () => {
  const strategy = new SimpleMAStrategy({ shortPeriod: 3, longPeriod: 5 });

  function createCandle(close: number, time: string): Candle {
    return {
      symbol: 'BTC',
      candleTime: time,
      open: new Big(close),
      high: new Big(close),
      low: new Big(close),
      close: new Big(close),
      volume: new Big(1000),
    };
  }

  it('충분한 캔들이 없으면 HOLD', () => {
    const candles: Candle[] = [
      createCandle(100, '2025-01-01'),
      createCandle(101, '2025-01-02'),
    ];

    const signal = strategy.generateSignal(candles, null);

    expect(signal.action).toBe('HOLD');
  });

  it('골든 크로스 시 BUY 신호', () => {
    // shortPeriod = 3, longPeriod = 5
    //
    // 이전 시점 (7개 캔들):
    //   shortMA (최근 3개): (5, 5, 5) / 3 = 5
    //   longMA (최근 5개): (5, 5, 5, 5, 5) / 5 = 5
    //   단기 5 <= 장기 5 ✓
    //
    // 현재 시점 (8개 캔들):
    //   shortMA (최근 3개): (5, 10, 20) / 3 = 11.67
    //   longMA (최근 5개): (5, 5, 5, 10, 20) / 5 = 9
    //   단기 11.67 > 장기 9 ✓
    //
    // → 골든 크로스 발생!
    const candles: Candle[] = [
      createCandle(5, '2025-01-01'),
      createCandle(5, '2025-01-02'),
      createCandle(5, '2025-01-03'),
      createCandle(5, '2025-01-04'),
      createCandle(5, '2025-01-05'),
      createCandle(5, '2025-01-06'),
      createCandle(10, '2025-01-07'),
      createCandle(20, '2025-01-08'),
    ];

    const signal = strategy.generateSignal(candles, null);

    expect(signal.action).toBe('BUY');
    expect(signal.reason).toContain('골든 크로스');
  });

  it('데드 크로스 시 SELL 신호', () => {
    // shortPeriod = 3, longPeriod = 5
    //
    // 이전 시점 (7개 캔들):
    //   shortMA (최근 3개): (20, 20, 20) / 3 = 20
    //   longMA (최근 5개): (20, 20, 20, 20, 20) / 5 = 20
    //   단기 20 >= 장기 20 ✓
    //
    // 현재 시점 (8개 캔들):
    //   shortMA (최근 3개): (20, 5, 2) / 3 = 9
    //   longMA (최근 5개): (20, 20, 20, 5, 2) / 5 = 13.4
    //   단기 9 < 장기 13.4 ✓
    //
    // → 데드 크로스 발생!
    const candles: Candle[] = [
      createCandle(20, '2025-01-01'),
      createCandle(20, '2025-01-02'),
      createCandle(20, '2025-01-03'),
      createCandle(20, '2025-01-04'),
      createCandle(20, '2025-01-05'),
      createCandle(20, '2025-01-06'),
      createCandle(5, '2025-01-07'),
      createCandle(2, '2025-01-08'),
    ];

    const position = {
      symbol: 'BTC',
      qty: new Big(1),
      avgPrice: new Big(100),
      unrealizedPnL: new Big(0),
      entryTime: '2025-01-01',
    };

    const signal = strategy.generateSignal(candles, position);

    expect(signal.action).toBe('SELL');
    expect(signal.reason).toContain('데드 크로스');
  });

  it('포지션 없이는 SELL 신호 안 나옴', () => {
    const candles: Candle[] = [
      createCandle(10, '2025-01-01'),
      createCandle(9, '2025-01-02'),
      createCandle(8, '2025-01-03'),
      createCandle(7, '2025-01-04'),
      createCandle(6, '2025-01-05'),
      createCandle(5, '2025-01-06'),
    ];

    const signal = strategy.generateSignal(candles, null);

    expect(signal.action).toBe('HOLD');
  });
});
