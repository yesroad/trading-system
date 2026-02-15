import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { checkTotalExposure as checkTotalExposureUtil } from '@workspace/trading-utils';
import { getAccountSize } from './position-sizer.js';
import type { ExposureValidationResult, Broker } from './types.js';

const logger = createLogger('exposure-tracker');

/**
 * 노출도 설정
 */
const EXPOSURE_CONFIG = {
  /** 최대 총 노출도 (100% = 1.0) */
  MAX_TOTAL_EXPOSURE: 1.0,
  /** 심볼당 최대 노출도 (25% = 0.25) */
  MAX_SYMBOL_EXPOSURE: 0.25,
};

/**
 * 총 노출도 체크
 *
 * 포트폴리오 전체 노출도가 100%를 초과하지 않는지 확인합니다.
 *
 * @param params - 검증 파라미터
 * @returns 노출도 검증 결과
 */
export async function checkTotalExposure(params: {
  broker: Broker;
  newPositionValue: Big;
}): Promise<ExposureValidationResult> {
  const { broker, newPositionValue } = params;

  logger.debug('총 노출도 체크 시작', {
    broker,
    newPositionValue: newPositionValue.toString(),
  });

  // 계좌 크기 조회
  const accountSize = await getAccountSize(broker);

  // TODO: 현재 보유 포지션 가치 조회 및 합산
  // 현재는 간단히 빈 배열 사용 (포지션 없음 가정)
  const currentPositions: Big[] = []; // TODO: 실제 포지션 가치 배열
  const maxExposure = new Big(EXPOSURE_CONFIG.MAX_TOTAL_EXPOSURE);

  // trading-utils의 검증 함수 사용
  const result = checkTotalExposureUtil(
    currentPositions,
    newPositionValue,
    accountSize,
    EXPOSURE_CONFIG.MAX_TOTAL_EXPOSURE
  );

  const currentTotal = currentPositions.reduce((sum, p) => sum.plus(p), new Big(0));
  const currentExposure = currentTotal.div(accountSize);
  const newExposure = result.newExposure;

  const exposureResult: ExposureValidationResult = {
    valid: result.valid,
    currentExposure: currentExposure,
    newExposure: newExposure,
    maxExposure: maxExposure,
    violations: result.violations,
  };

  if (!exposureResult.valid) {
    logger.warn('총 노출도 제한 위반', {
      broker,
      currentExposure: currentExposure.times(100).toFixed(2) + '%',
      newExposure: newExposure.times(100).toFixed(2) + '%',
      maxExposure: maxExposure.times(100).toFixed(2) + '%',
      violations: exposureResult.violations,
    });
  } else {
    logger.debug('총 노출도 체크 통과', {
      broker,
      newExposure: newExposure.times(100).toFixed(2) + '%',
    });
  }

  return exposureResult;
}

/**
 * 심볼별 노출도 체크
 *
 * 단일 심볼에 대한 노출도가 25%를 초과하지 않는지 확인합니다.
 *
 * @param params - 검증 파라미터
 * @returns 노출도 검증 결과
 */
export async function checkSymbolExposure(params: {
  symbol: string;
  broker: Broker;
  positionValue: Big;
}): Promise<ExposureValidationResult> {
  const { symbol, broker, positionValue } = params;

  logger.debug('심볼 노출도 체크 시작', {
    symbol,
    broker,
    positionValue: positionValue.toString(),
  });

  // 계좌 크기 조회
  const accountSize = await getAccountSize(broker);

  // 노출도 계산
  const exposure = positionValue.div(accountSize);
  const maxExposure = new Big(EXPOSURE_CONFIG.MAX_SYMBOL_EXPOSURE);

  const violations: string[] = [];

  if (exposure.gt(maxExposure)) {
    violations.push(
      `${symbol} 노출도 ${maxExposure.times(100).toFixed(0)}% 초과 (현재: ${exposure.times(100).toFixed(2)}%)`
    );
  }

  const result: ExposureValidationResult = {
    valid: violations.length === 0,
    currentExposure: exposure,
    newExposure: exposure,
    maxExposure,
    violations,
  };

  if (!result.valid) {
    logger.warn('심볼 노출도 제한 위반', {
      symbol,
      broker,
      exposure: exposure.times(100).toFixed(2) + '%',
      maxExposure: maxExposure.times(100).toFixed(2) + '%',
      violations,
    });
  } else {
    logger.debug('심볼 노출도 체크 통과', {
      symbol,
      broker,
      exposure: exposure.times(100).toFixed(2) + '%',
    });
  }

  return result;
}
