import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { analyzeVolume, checkVolumeConfirmation } from '../../indicators/volume.js';
import type { Candle } from '../../types.js';

// 테스트용 캔들 생성 헬퍼
function createCandle(close: number, volume: number): Candle {
  return {
    open: close,
    high: close,
    low: close,
    close,
    volume,
    timestamp: new Date().toISOString(),
  };
}

describe('analyzeVolume', () => {
  it('평균 거래량과 현재 거래량을 계산해야 함', () => {
    const candles: Candle[] = [];

    // 평균 거래량 1000 (20개)
    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100, 1000));
    }

    // 현재 거래량 1500
    candles.push(createCandle(100, 1500));

    const result = analyzeVolume(candles, 20);

    expect(result.avgVolume.toNumber()).toBe(1000);
    expect(result.currentVolume.toNumber()).toBe(1500);
    expect(result.volumeRatio.toNumber()).toBe(1.5);
    expect(result.isHighVolume).toBe(true); // 1.5배 이상
  });

  it('거래량 비율이 1.5배 미만이면 isHighVolume이 false여야 함', () => {
    const candles: Candle[] = [];

    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100, 1000));
    }

    candles.push(createCandle(100, 1200)); // 1.2배

    const result = analyzeVolume(candles, 20);

    expect(result.volumeRatio.toNumber()).toBe(1.2);
    expect(result.isHighVolume).toBe(false);
  });

  it('거래량 비율이 정확히 1.5배이면 isHighVolume이 true여야 함', () => {
    const candles: Candle[] = [];

    for (let i = 0; i < 20; i++) {
      candles.push(createCandle(100, 1000));
    }

    candles.push(createCandle(100, 1500));

    const result = analyzeVolume(candles, 20);

    expect(result.isHighVolume).toBe(true);
  });

  it('캔들 수가 부족하면 에러를 던져야 함', () => {
    const candles: Candle[] = [
      createCandle(100, 1000),
      createCandle(100, 1000),
    ];

    expect(() => analyzeVolume(candles, 20)).toThrow('거래량 분석에 최소 21개의 캔들이 필요');
  });

  it('사용자 정의 avgPeriod를 적용해야 함', () => {
    const candles: Candle[] = [];

    // 평균 거래량 1000 (10개)
    for (let i = 0; i < 10; i++) {
      candles.push(createCandle(100, 1000));
    }

    candles.push(createCandle(100, 2000));

    const result = analyzeVolume(candles, 10);

    expect(result.avgVolume.toNumber()).toBe(1000);
    expect(result.currentVolume.toNumber()).toBe(2000);
    expect(result.volumeRatio.toNumber()).toBe(2.0);
  });

  it('변동하는 거래량의 평균을 올바르게 계산해야 함', () => {
    const candles: Candle[] = [];

    // 거래량: 500, 1000, 1500 반복
    for (let i = 0; i < 21; i++) {
      const volume = ((i % 3) + 1) * 500;
      candles.push(createCandle(100, volume));
    }

    const result = analyzeVolume(candles, 20);

    // 평균: (500*7 + 1000*7 + 1500*6) / 20 = (3500 + 7000 + 9000) / 20 = 975
    expect(result.avgVolume.toNumber()).toBeCloseTo(975, 1);
  });
});

describe('checkVolumeConfirmation', () => {
  it('가격 상승 + 거래량 증가 = confirmed', () => {
    const candles: Candle[] = [
      createCandle(100, 1000),
      createCandle(105, 1200),
      createCandle(110, 1500),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('confirmed');
  });

  it('가격 하락 + 거래량 증가 = confirmed', () => {
    const candles: Candle[] = [
      createCandle(110, 1000),
      createCandle(105, 1200),
      createCandle(100, 1500),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('confirmed');
  });

  it('가격 상승 + 거래량 감소 = divergence', () => {
    const candles: Candle[] = [
      createCandle(100, 1500),
      createCandle(105, 1200),
      createCandle(110, 1000),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('divergence');
  });

  it('가격 하락 + 거래량 감소 = divergence', () => {
    const candles: Candle[] = [
      createCandle(110, 1500),
      createCandle(105, 1200),
      createCandle(100, 1000),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('divergence');
  });

  it('가격 변화 없음 = neutral', () => {
    const candles: Candle[] = [
      createCandle(100, 1000),
      createCandle(100, 1100),
      createCandle(100, 1200),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('neutral');
  });

  it('거래량 변화 없음 = neutral', () => {
    const candles: Candle[] = [
      createCandle(100, 1000),
      createCandle(105, 1000),
      createCandle(110, 1000),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('neutral');
  });

  it('캔들이 3개 미만이면 neutral', () => {
    const candles: Candle[] = [
      createCandle(100, 1000),
      createCandle(105, 1500),
    ];

    const result = checkVolumeConfirmation(candles);

    expect(result).toBe('neutral');
  });

  it('캔들이 3개 초과여도 마지막 3개만 사용해야 함', () => {
    const candles: Candle[] = [
      createCandle(90, 500),  // 무시됨
      createCandle(95, 700),  // 무시됨
      createCandle(100, 1000), // 사용됨
      createCandle(105, 1200),
      createCandle(110, 1500),
    ];

    const result = checkVolumeConfirmation(candles);

    // 가격 상승 (100 -> 110) + 거래량 증가 (1000 -> 1500)
    expect(result).toBe('confirmed');
  });
});
