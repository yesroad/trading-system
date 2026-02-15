import Big from 'big.js';
import type { PositionSizingParams, PositionSizingResult } from '../types.js';

/**
 * Kelly Criterion 기반 포지션 사이징
 *
 * 계좌 크기의 일정 비율만 리스크에 노출시킵니다.
 * 기본 리스크: 1% (0.01)
 *
 * @param params - 포지션 사이징 파라미터
 * @returns 포지션 사이징 결과
 *
 * @example
 * ```typescript
 * const result = calculatePositionSize({
 *   accountSize: new Big(10000000),  // 1000만원
 *   riskPercentage: 0.01,            // 1% 리스크
 *   entry: new Big(93000),           // 진입가
 *   stopLoss: new Big(91500),        // 손절가
 * });
 *
 * console.log(`포지션 크기: ${result.positionSize.toString()} 개`);
 * console.log(`포지션 가치: ${result.positionValue.toString()} 원`);
 * console.log(`리스크 금액: ${result.riskAmount.toString()} 원`);
 * ```
 */
export function calculatePositionSize(params: PositionSizingParams): PositionSizingResult {
  const { accountSize, riskPercentage, entry, stopLoss } = params;

  // 리스크 금액 = 계좌 크기 * 리스크 퍼센트
  const riskAmount = accountSize.times(riskPercentage);

  // 손절 거리 (퍼센트)
  const stopLossDistance = entry.minus(stopLoss).abs();
  const stopLossPct = stopLossDistance.div(entry);

  // 포지션 크기 = 리스크 금액 / (진입가 * 손절 퍼센트)
  let positionSize = riskAmount.div(entry.times(stopLossPct));

  // 포지션 가치
  let positionValue = positionSize.times(entry);

  // 최대 포지션 제한 (계좌의 25%)
  const maxPositionValue = accountSize.times(0.25);
  let limitedByMaxExposure = false;

  if (positionValue.gt(maxPositionValue)) {
    positionValue = maxPositionValue;
    positionSize = positionValue.div(entry);
    limitedByMaxExposure = true;
  }

  return {
    positionSize,
    positionValue,
    riskAmount,
    maxPositionValue,
    limitedByMaxExposure,
  };
}

/**
 * 고정 금액 기반 포지션 사이징
 *
 * @param targetValue - 목표 포지션 가치
 * @param entry - 진입가
 * @returns 포지션 크기
 */
export function calculateFixedValuePosition(targetValue: Big, entry: Big): Big {
  return targetValue.div(entry);
}

/**
 * 여러 리스크 퍼센트로 포지션 사이징 (백테스팅용)
 *
 * @param accountSize - 계좌 크기
 * @param entry - 진입가
 * @param stopLoss - 손절가
 * @param riskPercentages - 테스트할 리스크 퍼센트 배열
 * @returns 각 리스크 퍼센트별 결과
 */
export function calculateMultipleRiskSizes(
  accountSize: Big,
  entry: Big,
  stopLoss: Big,
  riskPercentages: number[]
): PositionSizingResult[] {
  return riskPercentages.map((riskPct) =>
    calculatePositionSize({
      accountSize,
      riskPercentage: riskPct,
      entry,
      stopLoss,
    })
  );
}
