import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import type { SignalPrices, SignalValidation, TechnicalSnapshot } from './types.js';

const logger = createLogger('signal-validator');

/**
 * 신호 검증 설정
 */
const VALIDATION_CONFIG = {
  /** 최소 신뢰도 */
  MIN_CONFIDENCE: 0.4,
  /** 최소 R/R 비율 */
  MIN_RISK_REWARD_RATIO: 1.5,
  /** 최소 손절 퍼센트 */
  MIN_STOP_LOSS_PCT: 0.005, // 0.5%
  /** 최대 손절 퍼센트 */
  MAX_STOP_LOSS_PCT: 0.05, // 5%
};

/**
 * 신호 가격 검증
 *
 * 진입가, 목표가, 손절가가 유효한 범위 내에 있는지 검증합니다.
 *
 * @param prices - 신호 가격 정보
 * @param direction - 매매 방향
 * @returns 검증 결과
 */
export function validateSignalPrices(
  prices: SignalPrices,
  direction: 'BUY' | 'SELL'
): SignalValidation {
  const violations: string[] = [];
  const { entry, target, stopLoss } = prices;

  logger.debug('신호 가격 검증 시작', {
    direction,
    entry: entry.toString(),
    target: target.toString(),
    stopLoss: stopLoss.toString(),
  });

  // 1. 가격이 모두 양수인지 확인
  if (entry.lte(0)) {
    violations.push('진입가는 0보다 커야 합니다');
  }
  if (target.lte(0)) {
    violations.push('목표가는 0보다 커야 합니다');
  }
  if (stopLoss.lte(0)) {
    violations.push('손절가는 0보다 커야 합니다');
  }

  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      riskRewardRatio: null,
      stopLossPct: null,
    };
  }

  // 2. 방향에 따른 가격 관계 검증
  if (direction === 'BUY') {
    // 매수: 손절가 < 진입가 < 목표가
    if (stopLoss.gte(entry)) {
      violations.push(`매수 신호: 손절가(${stopLoss.toString()})는 진입가(${entry.toString()})보다 낮아야 합니다`);
    }
    if (target.lte(entry)) {
      violations.push(`매수 신호: 목표가(${target.toString()})는 진입가(${entry.toString()})보다 높아야 합니다`);
    }
  } else {
    // 매도: 손절가 > 진입가 > 목표가
    if (stopLoss.lte(entry)) {
      violations.push(`매도 신호: 손절가(${stopLoss.toString()})는 진입가(${entry.toString()})보다 높아야 합니다`);
    }
    if (target.gte(entry)) {
      violations.push(`매도 신호: 목표가(${target.toString()})는 진입가(${entry.toString()})보다 낮아야 합니다`);
    }
  }

  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      riskRewardRatio: null,
      stopLossPct: null,
    };
  }

  // 3. 손절 퍼센트 계산 및 범위 검증
  const stopLossDistance = entry.minus(stopLoss).abs();
  const stopLossPct = stopLossDistance.div(entry);

  if (stopLossPct.lt(VALIDATION_CONFIG.MIN_STOP_LOSS_PCT)) {
    violations.push(
      `손절 폭이 너무 작습니다: ${stopLossPct.times(100).toFixed(2)}% (최소 ${VALIDATION_CONFIG.MIN_STOP_LOSS_PCT * 100}%)`
    );
  }

  if (stopLossPct.gt(VALIDATION_CONFIG.MAX_STOP_LOSS_PCT)) {
    violations.push(
      `손절 폭이 너무 큽니다: ${stopLossPct.times(100).toFixed(2)}% (최대 ${VALIDATION_CONFIG.MAX_STOP_LOSS_PCT * 100}%)`
    );
  }

  // 4. R/R 비율 계산 및 검증
  const targetDistance = entry.minus(target).abs();
  const riskRewardRatio = targetDistance.div(stopLossDistance);

  if (riskRewardRatio.lt(VALIDATION_CONFIG.MIN_RISK_REWARD_RATIO)) {
    violations.push(
      `R/R 비율이 너무 낮습니다: ${riskRewardRatio.toFixed(2)} (최소 ${VALIDATION_CONFIG.MIN_RISK_REWARD_RATIO})`
    );
  }

  logger.info('신호 가격 검증 완료', {
    direction,
    valid: violations.length === 0,
    stopLossPct: stopLossPct.toFixed(4),
    riskRewardRatio: riskRewardRatio.toFixed(2),
    violationsCount: violations.length,
  });

  return {
    valid: violations.length === 0,
    violations,
    riskRewardRatio,
    stopLossPct,
  };
}

/**
 * 신뢰도 검증
 *
 * @param confidence - 신뢰도 (0~1)
 * @returns 검증 통과 여부
 */
export function validateConfidence(confidence: number): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  if (confidence < VALIDATION_CONFIG.MIN_CONFIDENCE) {
    violations.push(
      `신뢰도가 너무 낮습니다: ${confidence.toFixed(2)} (최소 ${VALIDATION_CONFIG.MIN_CONFIDENCE})`
    );
  }

  if (confidence > 1) {
    violations.push(`신뢰도가 범위를 초과합니다: ${confidence.toFixed(2)} (최대 1.0)`);
  }

  logger.debug('신뢰도 검증', {
    confidence,
    valid: violations.length === 0,
  });

  return {
    valid: violations.length === 0,
    violations,
  };
}

/**
 * 기술적 지표 데이터 충분성 검증
 *
 * @param snapshot - 기술적 지표 스냅샷
 * @returns 검증 결과
 */
export function validateTechnicalData(snapshot: TechnicalSnapshot): {
  valid: boolean;
  violations: string[];
  availableIndicators: string[];
} {
  const violations: string[] = [];
  const availableIndicators: string[] = [];

  // 필수 지표: 최소 3개 이상
  if (snapshot.sma20 !== null) availableIndicators.push('SMA20');
  if (snapshot.ema20 !== null) availableIndicators.push('EMA20');
  if (snapshot.macd !== null) availableIndicators.push('MACD');
  if (snapshot.rsi !== null) availableIndicators.push('RSI');
  if (snapshot.volume !== null) availableIndicators.push('Volume');
  if (snapshot.supportResistance.length > 0) availableIndicators.push('S/R');
  if (snapshot.atr !== null) availableIndicators.push('ATR');

  if (availableIndicators.length < 3) {
    violations.push(
      `기술적 지표가 부족합니다: ${availableIndicators.length}개 (최소 3개 필요). 사용 가능: ${availableIndicators.join(', ')}`
    );
  }

  // ATR은 필수 (손절가 계산에 사용)
  if (snapshot.atr === null) {
    violations.push('ATR 데이터가 필요합니다 (손절가 계산용)');
  }

  logger.debug('기술적 지표 검증', {
    valid: violations.length === 0,
    availableIndicators,
    violationsCount: violations.length,
  });

  return {
    valid: violations.length === 0,
    violations,
    availableIndicators,
  };
}

/**
 * 종합 신호 검증
 *
 * 신호의 모든 요소를 검증합니다.
 *
 * @param params - 검증 파라미터
 * @returns 종합 검증 결과
 */
export function validateSignal(params: {
  prices: SignalPrices;
  confidence: number;
  direction: 'BUY' | 'SELL';
  technicalSnapshot: TechnicalSnapshot;
}): SignalValidation {
  logger.info('종합 신호 검증 시작', {
    direction: params.direction,
    confidence: params.confidence,
  });

  const allViolations: string[] = [];

  // 1. 가격 검증
  const priceValidation = validateSignalPrices(params.prices, params.direction);
  allViolations.push(...priceValidation.violations);

  // 2. 신뢰도 검증
  const confidenceValidation = validateConfidence(params.confidence);
  allViolations.push(...confidenceValidation.violations);

  // 3. 기술적 데이터 검증
  const technicalValidation = validateTechnicalData(params.technicalSnapshot);
  allViolations.push(...technicalValidation.violations);

  const valid = allViolations.length === 0;

  logger.info('종합 신호 검증 완료', {
    direction: params.direction,
    valid,
    violationsCount: allViolations.length,
    violations: allViolations,
  });

  return {
    valid,
    violations: allViolations,
    riskRewardRatio: priceValidation.riskRewardRatio,
    stopLossPct: priceValidation.stopLossPct,
  };
}
