import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { calculateATR, calculateATRPercent } from '../../atr/calculator.js';
import type { Candle } from '../../types.js';

describe('ATR Calculator', () => {
  // 테스트용 캔들 데이터 생성
  const createCandles = (count: number): Candle[] => {
    const candles: Candle[] = [];
    let basePrice = 100000;

    for (let i = 0; i < count; i++) {
      const open = basePrice;
      const close = basePrice + (Math.random() - 0.5) * 2000;
      const high = Math.max(open, close) + Math.random() * 500;
      const low = Math.min(open, close) - Math.random() * 500;

      candles.push({
        time: new Date(Date.now() - (count - i) * 3600000).toISOString(),
        open: open.toString(),
        high: high.toString(),
        low: low.toString(),
        close: close.toString(),
        volume: '1000000',
      });

      basePrice = close;
    }

    return candles;
  };

  // 고정된 테스트 데이터 (검증 가능)
  const fixedCandles: Candle[] = [
    {
      time: '2026-01-01T00:00:00Z',
      open: '100000',
      high: '101000',
      low: '99000',
      close: '100500',
      volume: '1000',
    },
    {
      time: '2026-01-01T01:00:00Z',
      open: '100500',
      high: '102000',
      low: '100000',
      close: '101500',
      volume: '1000',
    },
    {
      time: '2026-01-01T02:00:00Z',
      open: '101500',
      high: '102500',
      low: '101000',
      close: '102000',
      volume: '1000',
    },
  ];

  describe('calculateATR', () => {
    it('정상: 충분한 캔들로 ATR을 계산해야 함', () => {
      const candles = createCandles(20);
      const result = calculateATR(candles, 14);

      expect(result.atr).toBeInstanceOf(Big);
      expect(result.atr.gt(0)).toBe(true);
      expect(result.period).toBe(14);
      expect(result.trueRanges.length).toBe(candles.length - 1);
    });

    it('정상: period 기본값(14)으로 계산해야 함', () => {
      const candles = createCandles(20);
      const result = calculateATR(candles);

      expect(result.period).toBe(14);
    });

    it('경계: 최소 개수(period + 1)로 계산 가능해야 함', () => {
      const candles = createCandles(15); // 14 + 1
      const result = calculateATR(candles, 14);

      expect(result.atr).toBeInstanceOf(Big);
      expect(result.atr.gt(0)).toBe(true);
    });

    it('에러: 캔들 부족 시 에러를 발생시켜야 함', () => {
      const candles = createCandles(14); // period + 1보다 1개 적음

      expect(() => calculateATR(candles, 14)).toThrow(
        'ATR 계산에 최소 15개의 캔들이 필요합니다'
      );
    });

    it('고정 데이터: True Range가 올바르게 계산되어야 함', () => {
      const result = calculateATR(fixedCandles, 2);

      // True Range 계산 검증
      // TR1 = max(102000-100000, abs(102000-100500), abs(100000-100500)) = 2000
      // TR2 = max(102500-101000, abs(102500-101500), abs(101000-101500)) = 1500
      expect(result.trueRanges.length).toBe(2);
      expect(result.trueRanges[0].toString()).toBe('2000');
      expect(result.trueRanges[1].toString()).toBe('1500');

      // ATR = (TR1 + TR2) / 2 = 1750
      expect(result.atr.toString()).toBe('1750');
    });

    it('정상: Big.js 입력도 처리해야 함', () => {
      const candles: Candle[] = [
        {
          time: new Date('2026-01-01'),
          open: new Big(100000),
          high: new Big(101000),
          low: new Big(99000),
          close: new Big(100500),
          volume: new Big(1000),
        },
        {
          time: new Date('2026-01-02'),
          open: new Big(100500),
          high: new Big(102000),
          low: new Big(100000),
          close: new Big(101500),
          volume: new Big(1000),
        },
      ];

      expect(() => calculateATR(candles, 1)).not.toThrow();
    });
  });

  describe('calculateATRPercent', () => {
    it('정상: ATR을 퍼센트로 계산해야 함', () => {
      const candles = fixedCandles;
      const atrPct = calculateATRPercent(candles, 2);

      // ATR = 1750, 마지막 종가 = 102000
      // ATR% = 1750 / 102000 ≈ 0.01716 (1.716%)
      expect(atrPct).toBeInstanceOf(Big);
      expect(atrPct.gt(0)).toBe(true);
      expect(atrPct.lt(1)).toBe(true); // 100% 미만
      expect(atrPct.toFixed(5)).toBe('0.01716');
    });

    it('정상: 변동성이 클수록 ATR%가 높아야 함', () => {
      const lowVolatility = createCandles(20).map((c) => ({
        ...c,
        high: new Big(c.close).plus(100).toString(),
        low: new Big(c.close).minus(100).toString(),
      }));

      const highVolatility = createCandles(20).map((c) => ({
        ...c,
        high: new Big(c.close).plus(5000).toString(),
        low: new Big(c.close).minus(5000).toString(),
      }));

      const lowAtr = calculateATRPercent(lowVolatility);
      const highAtr = calculateATRPercent(highVolatility);

      expect(highAtr.gt(lowAtr)).toBe(true);
    });
  });
});
