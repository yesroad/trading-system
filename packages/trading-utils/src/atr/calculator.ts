import Big from 'big.js';
import type { Candle, NormalizedCandle, ATRResult } from '../types.js';

/**
 * 캔들 데이터를 Big.js 형식으로 정규화
 */
function normalizeCandle(candle: Candle): NormalizedCandle {
  return {
    time: typeof candle.time === 'string' ? new Date(candle.time) : candle.time,
    open: new Big(candle.open),
    high: new Big(candle.high),
    low: new Big(candle.low),
    close: new Big(candle.close),
    volume: new Big(candle.volume),
  };
}

/**
 * 단일 캔들의 True Range 계산
 * TR = max(고가 - 저가, abs(고가 - 이전종가), abs(저가 - 이전종가))
 */
function calculateTrueRange(current: NormalizedCandle, previous: NormalizedCandle): Big {
  const highLow = current.high.minus(current.low).abs();
  const highPrevClose = current.high.minus(previous.close).abs();
  const lowPrevClose = current.low.minus(previous.close).abs();

  // Big.js에 max가 없으므로 수동 비교
  let max = highLow;
  if (highPrevClose.gt(max)) max = highPrevClose;
  if (lowPrevClose.gt(max)) max = lowPrevClose;

  return max;
}

/**
 * ATR (Average True Range) 계산
 *
 * ATR은 변동성 측정 지표입니다. ATR이 높을수록 변동성이 큽니다.
 *
 * @param candles - OHLCV 캔들 배열 (최소 길이: period + 1)
 * @param period - ATR 기간 (기본값: 14)
 * @returns ATR 결과 (값 및 true range 배열)
 *
 * @example
 * ```typescript
 * const candles = await fetchCandles('BTC', '1h', 50);
 * const atrResult = calculateATR(candles, 14);
 * console.log(`ATR: ${atrResult.atr.toString()}`);
 * ```
 */
export function calculateATR(candles: Candle[], period = 14): ATRResult {
  if (candles.length < period + 1) {
    throw new Error(`ATR 계산에 최소 ${period + 1}개의 캔들이 필요합니다. 현재: ${candles.length}개`);
  }

  const normalized = candles.map(normalizeCandle);
  const trueRanges: Big[] = [];

  // True Range 계산
  for (let i = 1; i < normalized.length; i++) {
    const tr = calculateTrueRange(normalized[i], normalized[i - 1]);
    trueRanges.push(tr);
  }

  // 초기 ATR 계산 (첫 기간의 단순 평균)
  let atr = trueRanges
    .slice(0, period)
    .reduce((sum, tr) => sum.plus(tr), new Big(0))
    .div(period);

  // 나머지 기간의 평활화된 ATR 계산
  // ATR = ((이전ATR * (기간 - 1)) + 현재TR) / 기간
  for (let i = period; i < trueRanges.length; i++) {
    atr = atr.times(period - 1).plus(trueRanges[i]).div(period);
  }

  return {
    atr,
    period,
    trueRanges,
  };
}

/**
 * 현재 가격 대비 ATR 퍼센트 계산
 *
 * @param candles - OHLCV 캔들 배열
 * @param period - ATR 기간 (기본값: 14)
 * @returns 퍼센트로 표현된 ATR (예: 0.05 = 5%)
 *
 * @example
 * ```typescript
 * const atrPct = calculateATRPercent(candles);
 * console.log(`ATR: ${atrPct.times(100).toFixed(2)}%`);
 * ```
 */
export function calculateATRPercent(candles: Candle[], period = 14): Big {
  const atrResult = calculateATR(candles, period);
  const lastCandle = normalizeCandle(candles[candles.length - 1]);

  return atrResult.atr.div(lastCandle.close);
}
