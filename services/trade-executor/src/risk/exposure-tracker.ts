import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { checkTotalExposure as checkTotalExposureUtil } from '@workspace/trading-utils';
import { getSupabase } from '@workspace/db-client';
import { getAccountSize } from './position-sizer.js';
import type { ExposureValidationResult, Broker, Market } from './types.js';

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
 * 현재 포지션 가치 계산
 *
 * 보유 중인 포지션의 현재 가치를 계산합니다.
 * 각 포지션의 현재가를 조회하여 (현재가 × 수량)을 합산합니다.
 *
 * @param params - 조회 조건 (선택)
 * @param params.broker - 특정 브로커의 포지션만 조회
 * @param params.market - 특정 마켓의 포지션만 조회
 * @param params.symbol - 특정 심볼의 포지션만 조회
 * @returns 포지션 총 가치
 */
export async function getCurrentPositionValue(params?: {
  broker?: Broker;
  market?: Market;
  symbol?: string;
}): Promise<Big> {
  const supabase = getSupabase();

  // 1. 조건에 맞는 포지션 조회
  let query = supabase
    .from('positions')
    .select('symbol, market, broker, qty, avg_price')
    .gt('qty', 0);

  if (params?.broker) {
    query = query.eq('broker', params.broker);
  }
  if (params?.market) {
    query = query.eq('market', params.market);
  }
  if (params?.symbol) {
    query = query.eq('symbol', params.symbol);
  }

  const { data: positions, error } = await query;

  if (error) {
    logger.error('포지션 조회 실패', { error, params });
    throw new Error(`포지션 조회 실패: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    logger.debug('보유 포지션 없음', params);
    return new Big(0);
  }

  // 2. 각 포지션의 현재가 조회 및 가치 계산
  let totalValue = new Big(0);

  for (const position of positions) {
    // 현재가 조회 (최신 캔들)
    const tableName = getTableName(position.market);
    const { data: candles } = await supabase
      .from(tableName)
      .select('close')
      .eq('symbol', position.symbol)
      .order('candle_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!candles) {
      logger.warn('현재가 조회 실패, 평균 단가 사용', {
        symbol: position.symbol,
        market: position.market,
      });
      // 현재가를 못 찾으면 평균 단가 사용
      const positionValue = new Big(position.qty).times(new Big(position.avg_price));
      totalValue = totalValue.plus(positionValue);
      continue;
    }

    // 3. 현재가 × 수량
    const currentPrice = new Big(candles.close);
    const positionValue = new Big(position.qty).times(currentPrice);
    totalValue = totalValue.plus(positionValue);

    logger.debug('포지션 가치 계산', {
      symbol: position.symbol,
      qty: position.qty,
      currentPrice: currentPrice.toString(),
      positionValue: positionValue.toString(),
    });
  }

  logger.info('총 포지션 가치 계산 완료', {
    params,
    totalValue: totalValue.toString(),
    positionCount: positions.length,
  });

  return totalValue;
}

/**
 * 마켓에 따른 캔들 테이블 이름 반환
 */
function getTableName(market: Market): string {
  switch (market) {
    case 'CRYPTO':
      return 'upbit_candles';
    case 'KRX':
      return 'kis_candles';
    case 'US':
      return 'yf_candles';
    default:
      throw new Error(`알 수 없는 마켓: ${market}`);
  }
}

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

  // 현재 보유 포지션 가치 조회
  const currentTotalValue = await getCurrentPositionValue({ broker });
  const currentPositions = currentTotalValue.gt(0) ? [currentTotalValue] : [];
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
