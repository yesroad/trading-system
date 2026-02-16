import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { validateLeverage as validateLeverageUtil, getMaxLeverage } from '@workspace/trading-utils';
import { getAccountSize } from './position-sizer.js';
import { getCurrentPositionValue } from './exposure-tracker.js';
import type { LeverageValidationResult, Broker } from './types.js';

const logger = createLogger('leverage-manager');

/**
 * 레버리지 검증
 *
 * 심볼별 최대 레버리지를 체크합니다.
 * - BTC/ETH: 1.5x
 * - 기타 알트코인: 1.2x
 *
 * @param params - 검증 파라미터
 * @returns 레버리지 검증 결과
 */
export async function validateLeverage(params: {
  symbol: string;
  broker: Broker;
  positionValue: Big;
}): Promise<LeverageValidationResult> {
  const { symbol, broker, positionValue } = params;

  logger.debug('레버리지 검증 시작', {
    symbol,
    broker,
    positionValue: positionValue.toString(),
  });

  // 계좌 크기 조회
  const accountSize = await getAccountSize(broker);

  // trading-utils의 검증 함수 사용
  const result = validateLeverageUtil(symbol, positionValue, accountSize);

  if (!result.valid) {
    logger.warn('레버리지 제한 위반', {
      symbol,
      requestedLeverage: result.requestedLeverage.toFixed(2),
      maxLeverage: result.maxLeverage.toFixed(2),
      violations: result.violations,
    });
  } else {
    logger.debug('레버리지 검증 통과', {
      symbol,
      requestedLeverage: result.requestedLeverage.toFixed(2),
      maxLeverage: result.maxLeverage.toFixed(2),
    });
  }

  return result;
}

/**
 * 포트폴리오 전체 레버리지 검증
 *
 * 포트폴리오 전체 레버리지가 1.0x를 초과하지 않는지 확인합니다.
 *
 * @param params - 검증 파라미터
 * @returns 레버리지 검증 결과
 */
export async function validatePortfolioLeverage(params: {
  broker: Broker;
  newPositionValue: Big;
}): Promise<LeverageValidationResult> {
  const { broker, newPositionValue } = params;

  logger.debug('포트폴리오 레버리지 검증 시작', {
    broker,
    newPositionValue: newPositionValue.toString(),
  });

  // 현재 보유 포지션 가치 조회
  const currentPositionValue = await getCurrentPositionValue({ broker });
  const accountSize = await getAccountSize(broker);

  // 총 포지션 가치 = 현재 포지션 + 새 포지션
  const totalPositionValue = currentPositionValue.plus(newPositionValue);
  const totalLeverage = totalPositionValue.div(accountSize);
  const maxLeverage = new Big(1.0);

  logger.debug('포트폴리오 레버리지 계산', {
    broker,
    currentPositionValue: currentPositionValue.toString(),
    newPositionValue: newPositionValue.toString(),
    totalPositionValue: totalPositionValue.toString(),
    accountSize: accountSize.toString(),
    totalLeverage: totalLeverage.toFixed(2),
  });

  const violations: string[] = [];

  if (totalLeverage.gt(maxLeverage)) {
    violations.push(
      `포트폴리오 전체 레버리지 ${maxLeverage.toString()}x 초과 (현재: ${totalLeverage.toFixed(2)}x)`
    );
  }

  const result: LeverageValidationResult = {
    valid: violations.length === 0,
    requestedLeverage: totalLeverage,
    maxLeverage,
    violations,
  };

  if (!result.valid) {
    logger.warn('포트폴리오 레버리지 제한 위반', {
      broker,
      requestedLeverage: totalLeverage.toFixed(2),
      maxLeverage: maxLeverage.toFixed(2),
      violations,
    });
  } else {
    logger.debug('포트폴리오 레버리지 검증 통과', {
      broker,
      requestedLeverage: totalLeverage.toFixed(2),
    });
  }

  return result;
}

/**
 * 심볼의 최대 레버리지 조회
 *
 * @param symbol - 심볼
 * @returns 최대 레버리지
 */
export function getSymbolMaxLeverage(symbol: string): number {
  return getMaxLeverage(symbol);
}
