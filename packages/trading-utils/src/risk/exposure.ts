import Big from 'big.js';
import type { ExposureResult } from '../types.js';

/**
 * 총 노출 계산 및 검증
 *
 * @param currentPositions - 현재 포지션 가치 배열
 * @param newPositionValue - 신규 포지션 가치
 * @param accountSize - 총 계좌 크기
 * @param maxExposure - 최대 노출 비율 (기본값: 1.0 = 100%)
 * @returns 노출 검증 결과
 *
 * @example
 * ```typescript
 * const result = checkTotalExposure(
 *   [new Big(5000000), new Big(3000000)],  // 현재 포지션들
 *   new Big(4000000),                       // 신규 포지션
 *   new Big(10000000),                      // 계좌 크기
 *   1.0                                     // 최대 100% 노출
 * );
 *
 * if (!result.valid) {
 *   console.log(`노출 한도 초과: ${result.violations.join(', ')}`);
 * }
 * ```
 */
export function checkTotalExposure(
  currentPositions: Big[],
  newPositionValue: Big,
  accountSize: Big,
  maxExposure = 1.0
): ExposureResult {
  // 현재 총 노출
  const currentTotal = currentPositions.reduce((sum, p) => sum.plus(p), new Big(0));
  const currentExposure = currentTotal.div(accountSize);

  // 신규 포지션 포함 노출
  const newTotal = currentTotal.plus(newPositionValue);
  const newExposure = newTotal.div(accountSize);

  const maxExposureBig = new Big(maxExposure);

  const violations: string[] = [];

  if (newExposure.gt(maxExposureBig)) {
    violations.push(
      `총 노출 한도 ${(maxExposure * 100).toFixed(0)}% 초과 (현재: ${currentExposure.times(100).toFixed(2)}%, 신규 포함: ${newExposure.times(100).toFixed(2)}%)`
    );
  }

  return {
    valid: violations.length === 0,
    currentExposure,
    newExposure,
    maxExposure: maxExposureBig,
    violations,
  };
}

/**
 * 심볼별 최대 노출 검증
 *
 * @param positionValue - 포지션 가치
 * @param accountSize - 계좌 크기
 * @param maxSymbolExposure - 심볼당 최대 노출 (기본값: 0.25 = 25%)
 * @returns 검증 결과
 */
export function checkSymbolExposure(
  positionValue: Big,
  accountSize: Big,
  maxSymbolExposure = 0.25
): ExposureResult {
  const exposure = positionValue.div(accountSize);
  const maxExposureBig = new Big(maxSymbolExposure);

  const violations: string[] = [];

  if (exposure.gt(maxExposureBig)) {
    violations.push(
      `심볼별 최대 노출 ${(maxSymbolExposure * 100).toFixed(0)}% 초과 (요청: ${exposure.times(100).toFixed(2)}%)`
    );
  }

  return {
    valid: violations.length === 0,
    currentExposure: new Big(0),
    newExposure: exposure,
    maxExposure: maxExposureBig,
    violations,
  };
}

/**
 * 사용 가능 자본 계산
 *
 * @param accountSize - 총 계좌 크기
 * @param currentPositions - 현재 포지션 가치 배열
 * @param maxExposure - 최대 노출 비율 (기본값: 1.0)
 * @returns 사용 가능 자본
 */
export function calculateAvailableCapital(
  accountSize: Big,
  currentPositions: Big[],
  maxExposure = 1.0
): Big {
  const currentTotal = currentPositions.reduce((sum, p) => sum.plus(p), new Big(0));
  const maxTotal = accountSize.times(maxExposure);
  const available = maxTotal.minus(currentTotal);

  // Big.js에 max가 없으므로 수동 비교
  return available.gt(0) ? available : new Big(0);
}
