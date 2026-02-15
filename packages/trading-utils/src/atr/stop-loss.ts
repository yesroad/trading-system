import Big from 'big.js';
import type { ATRStopLossParams, ATRStopLossResult } from '../types.js';

/**
 * ATR 기반 동적 손절매 계산
 *
 * ATR을 사용하여 시장 변동성에 맞는 손절매 레벨을 계산합니다.
 * 기본 배수는 2.0이며, 최소/최대 퍼센트로 제한됩니다.
 *
 * @param params - ATR 손절매 파라미터
 * @returns ATR 손절매 결과
 *
 * @example
 * ```typescript
 * const atr = calculateATR(candles, 14);
 * const stopLoss = calculateATRStopLoss({
 *   entry: new Big(93000),
 *   atr: atr.atr,
 *   multiplier: 2.0,  // ATR의 2배
 *   minPct: 0.005,    // 최소 0.5%
 *   maxPct: 0.05,     // 최대 5%
 * });
 *
 * console.log(`손절가: ${stopLoss.stopLoss.toString()}`);
 * console.log(`손절 거리: ${stopLoss.stopLossPct.times(100).toFixed(2)}%`);
 * ```
 */
export function calculateATRStopLoss(params: ATRStopLossParams): ATRStopLossResult {
  const {
    entry,
    atr,
    multiplier = 2.0,
    minPct = 0.005,  // 0.5%
    maxPct = 0.05,   // 5.0%
  } = params;

  // ATR * 배수로 손절 거리 계산
  const atrDistance = atr.times(multiplier);

  // 손절가 계산 (롱 포지션 기준: entry - distance)
  let stopLoss = entry.minus(atrDistance);

  // 퍼센트 거리 계산
  let stopLossPct = atrDistance.div(entry);

  // 제한 플래그
  let clampedByMin = false;
  let clampedByMax = false;

  // 최소 퍼센트 제한 (손절이 너무 좁으면)
  if (stopLossPct.lt(minPct)) {
    stopLossPct = new Big(minPct);
    stopLoss = entry.minus(entry.times(minPct));
    clampedByMin = true;
  }

  // 최대 퍼센트 제한 (손절이 너무 넓으면)
  if (stopLossPct.gt(maxPct)) {
    stopLossPct = new Big(maxPct);
    stopLoss = entry.minus(entry.times(maxPct));
    clampedByMax = true;
  }

  return {
    stopLoss,
    stopLossDistance: entry.minus(stopLoss),
    stopLossPct,
    atrMultiplier: multiplier,
    clampedByMin,
    clampedByMax,
  };
}

/**
 * 여러 ATR 배수로 손절매 계산 (백테스팅용)
 *
 * @param entry - 진입가
 * @param atr - ATR 값
 * @param multipliers - 테스트할 배수 배열 (기본값: [1.5, 2.0, 2.5, 3.0])
 * @returns 각 배수별 손절매 결과 배열
 *
 * @example
 * ```typescript
 * const results = calculateMultipleATRStopLoss(
 *   new Big(93000),
 *   atr.atr,
 *   [1.5, 2.0, 2.5, 3.0]
 * );
 *
 * results.forEach(r => {
 *   console.log(`${r.atrMultiplier}x ATR: ${r.stopLoss.toString()} (${r.stopLossPct.times(100).toFixed(2)}%)`);
 * });
 * ```
 */
export function calculateMultipleATRStopLoss(
  entry: Big,
  atr: Big,
  multipliers = [1.5, 2.0, 2.5, 3.0]
): ATRStopLossResult[] {
  return multipliers.map((mult) =>
    calculateATRStopLoss({
      entry,
      atr,
      multiplier: mult,
    })
  );
}

/**
 * 숏 포지션용 ATR 손절매 계산
 *
 * @param params - ATR 손절매 파라미터
 * @returns ATR 손절매 결과 (숏 포지션용)
 *
 * @example
 * ```typescript
 * const stopLoss = calculateATRStopLossShort({
 *   entry: new Big(93000),
 *   atr: atr.atr,
 *   multiplier: 2.0,
 * });
 * ```
 */
export function calculateATRStopLossShort(params: ATRStopLossParams): ATRStopLossResult {
  const {
    entry,
    atr,
    multiplier = 2.0,
    minPct = 0.005,
    maxPct = 0.05,
  } = params;

  // ATR * 배수로 손절 거리 계산
  const atrDistance = atr.times(multiplier);

  // 손절가 계산 (숏 포지션: entry + distance)
  let stopLoss = entry.plus(atrDistance);

  // 퍼센트 거리 계산
  let stopLossPct = atrDistance.div(entry);

  // 제한 플래그
  let clampedByMin = false;
  let clampedByMax = false;

  // 최소 퍼센트 제한
  if (stopLossPct.lt(minPct)) {
    stopLossPct = new Big(minPct);
    stopLoss = entry.plus(entry.times(minPct));
    clampedByMin = true;
  }

  // 최대 퍼센트 제한
  if (stopLossPct.gt(maxPct)) {
    stopLossPct = new Big(maxPct);
    stopLoss = entry.plus(entry.times(maxPct));
    clampedByMax = true;
  }

  return {
    stopLoss,
    stopLossDistance: stopLoss.minus(entry),
    stopLossPct,
    atrMultiplier: multiplier,
    clampedByMin,
    clampedByMax,
  };
}
