import Big from 'big.js';
import type { Candle, MACDResult } from '../types.js';

/**
 * EMA 계산 (내부 헬퍼)
 */
function calculateEMA(values: Big[], period: number): Big[] {
  const emaValues: Big[] = [];

  // 첫 EMA는 SMA로 시작
  const firstSum = values.slice(0, period).reduce((acc, val) => acc.plus(val), new Big(0));
  const firstEMA = firstSum.div(period);
  emaValues.push(firstEMA);

  // 평활 계수
  const multiplier = new Big(2).div(period + 1);

  // 나머지 EMA 계산
  for (let i = period; i < values.length; i++) {
    const ema = values[i].minus(emaValues[emaValues.length - 1]).times(multiplier).plus(emaValues[emaValues.length - 1]);
    emaValues.push(ema);
  }

  return emaValues;
}

/**
 * MACD (Moving Average Convergence Divergence) 계산
 *
 * MACD = 12일 EMA - 26일 EMA
 * Signal = MACD의 9일 EMA
 * Histogram = MACD - Signal
 *
 * @param candles - OHLCV 캔들 배열 (최소 33개 필요)
 * @param fastPeriod - 빠른 EMA 기간 (기본값: 12)
 * @param slowPeriod - 느린 EMA 기간 (기본값: 26)
 * @param signalPeriod - 시그널선 기간 (기본값: 9)
 * @returns MACD 결과
 *
 * @example
 * ```typescript
 * const macd = calculateMACD(candles);
 * console.log(`MACD: ${macd.macd.toString()}`);
 * console.log(`Signal: ${macd.signal.toString()}`);
 * console.log(`Histogram: ${macd.histogram.toString()}`);
 *
 * if (macd.histogram.gt(0)) {
 *   console.log('상승 모멘텀');
 * } else {
 *   console.log('하락 모멘텀');
 * }
 * ```
 */
export function calculateMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult {
  const minLength = slowPeriod + signalPeriod;
  if (candles.length < minLength) {
    throw new Error(`MACD 계산에 최소 ${minLength}개의 캔들이 필요합니다. 현재: ${candles.length}개`);
  }

  const closes = candles.map((c) => new Big(c.close));

  // 빠른 EMA (12일)
  const fastEMAs = calculateEMA(closes, fastPeriod);

  // 느린 EMA (26일)
  const slowEMAs = calculateEMA(closes, slowPeriod);

  // MACD 라인 = 빠른 EMA - 느린 EMA
  // slowEMA가 늦게 시작하므로 offset 계산
  const offset = slowPeriod - fastPeriod;
  const macdValues: Big[] = [];

  for (let i = 0; i < slowEMAs.length; i++) {
    const macdValue = fastEMAs[i + offset].minus(slowEMAs[i]);
    macdValues.push(macdValue);
  }

  // 시그널선 = MACD의 9일 EMA
  const signalEMAs = calculateEMA(macdValues, signalPeriod);

  // 최신 값 반환
  const latestMACD = macdValues[macdValues.length - 1];
  const latestSignal = signalEMAs[signalEMAs.length - 1];
  const latestHistogram = latestMACD.minus(latestSignal);

  return {
    macd: latestMACD,
    signal: latestSignal,
    histogram: latestHistogram,
  };
}

/**
 * MACD 크로스오버 확인
 *
 * @param current - 현재 MACD
 * @param previous - 이전 MACD (1봉 전)
 * @returns 'bullish' (상승 크로스오버), 'bearish' (하락 크로스오버), null
 *
 * @example
 * ```typescript
 * const currentMACD = calculateMACD(candles);
 * const previousMACD = calculateMACD(candles.slice(0, -1));
 *
 * const crossover = checkMACDCrossover(currentMACD, previousMACD);
 * if (crossover === 'bullish') {
 *   console.log('MACD 상승 크로스오버: 매수 신호');
 * }
 * ```
 */
export function checkMACDCrossover(
  current: MACDResult,
  previous: MACDResult
): 'bullish' | 'bearish' | null {
  // 이전에 MACD < Signal, 현재 MACD > Signal: 상승 크로스오버
  if (previous.histogram.lt(0) && current.histogram.gt(0)) {
    return 'bullish';
  }

  // 이전에 MACD > Signal, 현재 MACD < Signal: 하락 크로스오버
  if (previous.histogram.gt(0) && current.histogram.lt(0)) {
    return 'bearish';
  }

  return null;
}
