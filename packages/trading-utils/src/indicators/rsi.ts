import Big from 'big.js';
import type { Candle, RSIResult } from '../types.js';

/**
 * RSI (Relative Strength Index) 계산
 *
 * RSI는 0-100 범위의 모멘텀 지표입니다.
 * - RSI > 70: 과매수 (Overbought)
 * - RSI < 30: 과매도 (Oversold)
 *
 * @param candles - OHLCV 캔들 배열 (최소 period + 1개 필요)
 * @param period - RSI 기간 (기본값: 14)
 * @returns RSI 결과
 *
 * @example
 * ```typescript
 * const rsi = calculateRSI(candles, 14);
 * console.log(`RSI: ${rsi.value.toFixed(2)}`);
 *
 * if (rsi.overbought) {
 *   console.log('과매수 구간 - 매도 고려');
 * } else if (rsi.oversold) {
 *   console.log('과매도 구간 - 매수 고려');
 * }
 * ```
 */
export function calculateRSI(candles: Candle[], period = 14): RSIResult {
  if (candles.length < period + 1) {
    throw new Error(`RSI 계산에 최소 ${period + 1}개의 캔들이 필요합니다. 현재: ${candles.length}개`);
  }

  const closes = candles.map((c) => new Big(c.close));

  // 가격 변화 계산
  const changes: Big[] = [];
  for (let i = 1; i < closes.length; i++) {
    changes.push(closes[i].minus(closes[i - 1]));
  }

  // 상승/하락 분리
  let gains = new Big(0);
  let losses = new Big(0);

  // 첫 period 동안의 평균 상승/하락
  for (let i = 0; i < period; i++) {
    if (changes[i].gt(0)) {
      gains = gains.plus(changes[i]);
    } else {
      losses = losses.plus(changes[i].abs());
    }
  }

  let avgGain = gains.div(period);
  let avgLoss = losses.div(period);

  // Smoothed RSI (Wilder's smoothing)
  for (let i = period; i < changes.length; i++) {
    const change = changes[i];

    if (change.gt(0)) {
      avgGain = avgGain.times(period - 1).plus(change).div(period);
      avgLoss = avgLoss.times(period - 1).div(period);
    } else {
      avgGain = avgGain.times(period - 1).div(period);
      avgLoss = avgLoss.times(period - 1).plus(change.abs()).div(period);
    }
  }

  // RSI 계산
  let rsi: Big;

  if (avgLoss.eq(0)) {
    // 모두 상승 -> RSI = 100
    rsi = new Big(100);
  } else {
    const rs = avgGain.div(avgLoss);
    rsi = new Big(100).minus(new Big(100).div(new Big(1).plus(rs)));
  }

  return {
    value: rsi,
    overbought: rsi.gt(70),
    oversold: rsi.lt(30),
  };
}

/**
 * RSI 다이버전스 확인
 *
 * @param prices - 가격 배열 (최근 2개)
 * @param rsiValues - RSI 값 배열 (최근 2개)
 * @returns 'bullish' (강세 다이버전스), 'bearish' (약세 다이버전스), null
 *
 * @example
 * ```typescript
 * // 강세 다이버전스: 가격은 하락하는데 RSI는 상승 (매수 신호)
 * // 약세 다이버전스: 가격은 상승하는데 RSI는 하락 (매도 신호)
 *
 * const prices = [new Big(90000), new Big(89000)];
 * const rsiValues = [new Big(35), new Big(40)];
 * const divergence = checkRSIDivergence(prices, rsiValues);
 *
 * if (divergence === 'bullish') {
 *   console.log('강세 다이버전스: 반등 가능성');
 * }
 * ```
 */
export function checkRSIDivergence(
  prices: [Big, Big],
  rsiValues: [Big, Big]
): 'bullish' | 'bearish' | null {
  const [oldPrice, newPrice] = prices;
  const [oldRSI, newRSI] = rsiValues;

  // 강세 다이버전스: 가격 하락 but RSI 상승
  if (newPrice.lt(oldPrice) && newRSI.gt(oldRSI)) {
    return 'bullish';
  }

  // 약세 다이버전스: 가격 상승 but RSI 하락
  if (newPrice.gt(oldPrice) && newRSI.lt(oldRSI)) {
    return 'bearish';
  }

  return null;
}
