import Big from 'big.js';
import type { Candle, MAType } from '../types.js';

/**
 * 단순 이동평균 (SMA) 계산
 *
 * @param values - 값 배열
 * @param period - 이동평균 기간
 * @returns SMA 값
 */
function calculateSMA(values: Big[], period: number): Big {
  if (values.length < period) {
    throw new Error(`SMA 계산에 최소 ${period}개의 값이 필요합니다. 현재: ${values.length}개`);
  }

  const slice = values.slice(-period);
  const sum = slice.reduce((acc, val) => acc.plus(val), new Big(0));
  return sum.div(period);
}

/**
 * 지수 이동평균 (EMA) 계산
 *
 * @param values - 값 배열
 * @param period - 이동평균 기간
 * @returns EMA 값
 */
function calculateEMA(values: Big[], period: number): Big {
  if (values.length < period) {
    throw new Error(`EMA 계산에 최소 ${period}개의 값이 필요합니다. 현재: ${values.length}개`);
  }

  // 첫 EMA는 SMA로 시작
  const firstSMA = calculateSMA(values.slice(0, period), period);

  // 평활 계수: 2 / (period + 1)
  const multiplier = new Big(2).div(period + 1);

  let ema = firstSMA;

  // EMA = (현재가 - 이전EMA) * 평활계수 + 이전EMA
  for (let i = period; i < values.length; i++) {
    ema = values[i].minus(ema).times(multiplier).plus(ema);
  }

  return ema;
}

/**
 * 가중 이동평균 (WMA) 계산
 *
 * @param values - 값 배열
 * @param period - 이동평균 기간
 * @returns WMA 값
 */
function calculateWMA(values: Big[], period: number): Big {
  if (values.length < period) {
    throw new Error(`WMA 계산에 최소 ${period}개의 값이 필요합니다. 현재: ${values.length}개`);
  }

  const slice = values.slice(-period);
  let sum = new Big(0);
  let weightSum = 0;

  // 최근 값일수록 높은 가중치 (1, 2, 3, ..., period)
  for (let i = 0; i < slice.length; i++) {
    const weight = i + 1;
    sum = sum.plus(slice[i].times(weight));
    weightSum += weight;
  }

  return sum.div(weightSum);
}

/**
 * 이동평균 계산 (SMA, EMA, WMA)
 *
 * @param candles - OHLCV 캔들 배열
 * @param period - 이동평균 기간
 * @param type - 이동평균 타입 (기본값: SMA)
 * @returns 이동평균 값
 *
 * @example
 * ```typescript
 * const sma20 = calculateMA(candles, 20, 'SMA');
 * const ema20 = calculateMA(candles, 20, 'EMA');
 * const wma20 = calculateMA(candles, 20, 'WMA');
 * ```
 */
export function calculateMA(candles: Candle[], period: number, type: MAType = 'SMA'): Big {
  const closes = candles.map((c) => new Big(c.close));

  switch (type) {
    case 'SMA':
      return calculateSMA(closes, period);
    case 'EMA':
      return calculateEMA(closes, period);
    case 'WMA':
      return calculateWMA(closes, period);
    default:
      throw new Error(`지원하지 않는 이동평균 타입: ${type}`);
  }
}

/**
 * 여러 기간의 이동평균 계산
 *
 * @param candles - OHLCV 캔들 배열
 * @param periods - 이동평균 기간 배열 (예: [20, 50, 200])
 * @param type - 이동평균 타입
 * @returns 각 기간별 이동평균 값 맵
 *
 * @example
 * ```typescript
 * const mas = calculateMultipleMA(candles, [20, 50, 200], 'SMA');
 * console.log(`MA20: ${mas[20].toString()}`);
 * console.log(`MA50: ${mas[50].toString()}`);
 * console.log(`MA200: ${mas[200].toString()}`);
 * ```
 */
export function calculateMultipleMA(
  candles: Candle[],
  periods: number[],
  type: MAType = 'SMA'
): Record<number, Big> {
  const result: Record<number, Big> = {};

  for (const period of periods) {
    try {
      result[period] = calculateMA(candles, period, type);
    } catch (error) {
      // 캔들이 부족하면 건너뜀
      continue;
    }
  }

  return result;
}

/**
 * 가격이 이동평균 위/아래에 있는지 확인
 *
 * @param currentPrice - 현재 가격
 * @param ma - 이동평균 값
 * @returns true면 가격이 이동평균 위, false면 아래
 */
export function isPriceAboveMA(currentPrice: Big, ma: Big): boolean {
  return currentPrice.gt(ma);
}

/**
 * 이동평균 골든크로스/데드크로스 확인
 *
 * @param shortMA - 단기 이동평균 (예: MA20)
 * @param longMA - 장기 이동평균 (예: MA50)
 * @returns 'golden' (골든크로스), 'death' (데드크로스), null (없음)
 *
 * @example
 * ```typescript
 * const ma20 = calculateMA(candles, 20, 'SMA');
 * const ma50 = calculateMA(candles, 50, 'SMA');
 * const crossover = checkMACrossover(ma20, ma50);
 *
 * if (crossover === 'golden') {
 *   console.log('골든크로스: 매수 신호');
 * } else if (crossover === 'death') {
 *   console.log('데드크로스: 매도 신호');
 * }
 * ```
 */
export function checkMACrossover(
  shortMA: Big,
  longMA: Big
): 'golden' | 'death' | null {
  // 단기선이 장기선 위에 있으면 골든크로스 (상승 신호)
  if (shortMA.gt(longMA)) {
    return 'golden';
  }

  // 단기선이 장기선 아래에 있으면 데드크로스 (하락 신호)
  if (shortMA.lt(longMA)) {
    return 'death';
  }

  return null;
}
