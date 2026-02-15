import Big from 'big.js';
import type { Candle, VolumeAnalysis } from '../types.js';

/**
 * 거래량 분석
 *
 * @param candles - OHLCV 캔들 배열
 * @param avgPeriod - 평균 거래량 기간 (기본값: 20)
 * @returns 거래량 분석 결과
 *
 * @example
 * ```typescript
 * const volumeAnalysis = analyzeVolume(candles, 20);
 *
 * if (volumeAnalysis.isHighVolume) {
 *   console.log(`거래량 급증: ${volumeAnalysis.volumeRatio.toFixed(2)}배`);
 * }
 * ```
 */
export function analyzeVolume(candles: Candle[], avgPeriod = 20): VolumeAnalysis {
  if (candles.length < avgPeriod + 1) {
    throw new Error(`거래량 분석에 최소 ${avgPeriod + 1}개의 캔들이 필요합니다. 현재: ${candles.length}개`);
  }

  const volumes = candles.map((c) => new Big(c.volume));

  // 평균 거래량 계산 (최근 n개 제외한 마지막 1개)
  const avgVolumes = volumes.slice(-(avgPeriod + 1), -1);
  const avgVolume = avgVolumes.reduce((sum, v) => sum.plus(v), new Big(0)).div(avgPeriod);

  // 현재 거래량
  const currentVolume = volumes[volumes.length - 1];

  // 거래량 비율
  const volumeRatio = currentVolume.div(avgVolume);

  // 고거래량 여부 (평균의 1.5배 이상)
  const isHighVolume = volumeRatio.gte(1.5);

  return {
    avgVolume,
    currentVolume,
    volumeRatio,
    isHighVolume,
  };
}

/**
 * 거래량과 가격 변화 상관관계 확인
 *
 * @param candles - OHLCV 캔들 배열
 * @returns 'confirmed' (거래량이 가격 변화 확인), 'divergence' (거래량과 가격 다이버전스), 'neutral'
 *
 * @example
 * ```typescript
 * const confirmation = checkVolumeConfirmation(candles);
 *
 * if (confirmation === 'confirmed') {
 *   console.log('거래량이 가격 상승/하락 확인');
 * } else if (confirmation === 'divergence') {
 *   console.log('거래량 다이버전스: 추세 전환 가능성');
 * }
 * ```
 */
export function checkVolumeConfirmation(
  candles: Candle[]
): 'confirmed' | 'divergence' | 'neutral' {
  if (candles.length < 3) {
    return 'neutral';
  }

  const recent = candles.slice(-3);

  const priceChange = new Big(recent[2].close).minus(new Big(recent[0].close));
  const volumeChange = new Big(recent[2].volume).minus(new Big(recent[0].volume));

  // 가격 상승 + 거래량 증가: 확인
  if (priceChange.gt(0) && volumeChange.gt(0)) {
    return 'confirmed';
  }

  // 가격 하락 + 거래량 증가: 확인
  if (priceChange.lt(0) && volumeChange.gt(0)) {
    return 'confirmed';
  }

  // 가격 변화와 거래량 변화가 반대: 다이버전스
  if ((priceChange.gt(0) && volumeChange.lt(0)) || (priceChange.lt(0) && volumeChange.lt(0))) {
    return 'divergence';
  }

  return 'neutral';
}
