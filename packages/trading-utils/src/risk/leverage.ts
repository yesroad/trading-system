import Big from 'big.js';
import type { LeverageValidationResult } from '../types.js';

/**
 * 심볼별 최대 레버리지 규칙
 */
const LEVERAGE_LIMITS: Record<string, number> = {
  BTC: 1.5,
  ETH: 1.5,
  // 기타 알트코인은 1.2x
};

/**
 * 심볼의 최대 레버리지 가져오기
 *
 * @param symbol - 심볼 (예: 'BTC', 'ETH', 'SOL')
 * @returns 최대 레버리지
 */
export function getMaxLeverage(symbol: string): number {
  return LEVERAGE_LIMITS[symbol] ?? 1.2; // 기본값: 1.2x
}

/**
 * 레버리지 검증
 *
 * @param symbol - 심볼
 * @param positionValue - 포지션 가치
 * @param accountSize - 계좌 크기
 * @returns 레버리지 검증 결과
 *
 * @example
 * ```typescript
 * const validation = validateLeverage(
 *   'BTC',
 *   new Big(15000000),  // 1500만원 포지션
 *   new Big(10000000)   // 1000만원 계좌
 * );
 *
 * if (!validation.valid) {
 *   console.log(`레버리지 위반: ${validation.violations.join(', ')}`);
 * }
 * ```
 */
export function validateLeverage(
  symbol: string,
  positionValue: Big,
  accountSize: Big
): LeverageValidationResult {
  const requestedLeverage = positionValue.div(accountSize);
  const maxLeverage = new Big(getMaxLeverage(symbol));

  const violations: string[] = [];

  if (requestedLeverage.gt(maxLeverage)) {
    violations.push(
      `${symbol} 최대 레버리지 ${maxLeverage.toString()}x 초과 (요청: ${requestedLeverage.toFixed(2)}x)`
    );
  }

  return {
    valid: violations.length === 0,
    requestedLeverage,
    maxLeverage,
    violations,
  };
}

/**
 * 포트폴리오 전체 레버리지 계산
 *
 * @param positions - 포지션 가치 배열
 * @param accountSize - 총 계좌 크기
 * @returns 포트폴리오 레버리지
 */
export function calculatePortfolioLeverage(
  positions: Big[],
  accountSize: Big
): Big {
  const totalPositionValue = positions.reduce((sum, p) => sum.plus(p), new Big(0));
  return totalPositionValue.div(accountSize);
}

/**
 * 포트폴리오 레버리지 검증 (최대 1.0x)
 *
 * @param positions - 포지션 가치 배열
 * @param accountSize - 총 계좌 크기
 * @returns 검증 결과
 */
export function validatePortfolioLeverage(
  positions: Big[],
  accountSize: Big
): LeverageValidationResult {
  const totalLeverage = calculatePortfolioLeverage(positions, accountSize);
  const maxLeverage = new Big(1.0);

  const violations: string[] = [];

  if (totalLeverage.gt(maxLeverage)) {
    violations.push(
      `포트폴리오 전체 레버리지 ${maxLeverage.toString()}x 초과 (현재: ${totalLeverage.toFixed(2)}x)`
    );
  }

  return {
    valid: violations.length === 0,
    requestedLeverage: totalLeverage,
    maxLeverage,
    violations,
  };
}
