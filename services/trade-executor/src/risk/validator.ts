import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { logRiskEvent, checkEventRisk, getRecommendation } from '@workspace/db-client';
import { checkCircuitBreaker } from './circuit-breaker.js';
import { calculatePositionSizeForBroker } from './position-sizer.js';
import { validateLeverage, validatePortfolioLeverage } from './leverage-manager.js';
import { checkTotalExposure, checkSymbolExposure } from './exposure-tracker.js';
import type { RiskValidationParams, RiskValidationResult } from './types.js';

const logger = createLogger('risk-validator');

/**
 * 종합 리스크 검증
 *
 * 모든 거래 전에 호출되는 메인 리스크 게이트키퍼입니다.
 *
 * 검증 항목:
 * 1. 서킷 브레이커 체크 (-5% 일일 손실 한도)
 * 2. 이벤트 리스크 체크 (실적 발표 등)
 * 3. 포지션 크기 계산 (1% 리스크 기반)
 * 4. 레버리지 검증 (심볼별 + 포트폴리오)
 * 5. 노출도 검증 (심볼별 25%, 총 100%)
 * 6. 손절 범위 검증 (0.5% ~ 5%)
 *
 * @param params - 리스크 검증 파라미터
 * @returns 종합 리스크 검증 결과
 */
export async function validateTradeRisk(params: RiskValidationParams): Promise<RiskValidationResult> {
  const { symbol, market, broker, entry, stopLoss, signalConfidence } = params;

  logger.info('종합 리스크 검증 시작', {
    symbol,
    market,
    broker,
    entry: entry.toString(),
    stopLoss: stopLoss.toString(),
    signalConfidence,
  });

  const violations: string[] = [];
  const warnings: string[] = [];

  // 기본값
  let positionSize = new Big(0);
  let positionValue = new Big(0);

  try {
    // ========================================
    // 1. 서킷 브레이커 체크
    // ========================================
    logger.debug('1. 서킷 브레이커 체크 중...');
    const circuitBreakerState = await checkCircuitBreaker(broker);

    if (circuitBreakerState.triggered) {
      violations.push('서킷 브레이커 발동 - 거래 중지');

      return {
        approved: false,
        positionSize: new Big(0),
        positionValue: new Big(0),
        violations,
        warnings,
        circuitBreakerState,
      };
    }

    // ========================================
    // 2. 이벤트 리스크 체크
    // ========================================
    logger.debug('2. 이벤트 리스크 체크 중...');
    const eventRisk = await checkEventRisk(symbol);

    if (eventRisk.hasRisk) {
      const recommendation = getRecommendation(eventRisk.riskLevel);

      if (recommendation === 'block') {
        violations.push(`고위험 이벤트로 거래 차단: ${eventRisk.reason}`);
        logger.warn('고위험 이벤트로 거래 차단', {
          symbol,
          eventRisk,
        });

        return {
          approved: false,
          positionSize: new Big(0),
          positionValue: new Big(0),
          violations,
          warnings,
          circuitBreakerState,
          eventRisk,
        };
      } else if (recommendation === 'reduce_size') {
        warnings.push(`중위험 이벤트로 포지션 크기 50% 축소: ${eventRisk.reason}`);
        logger.warn('중위험 이벤트로 포지션 크기 축소 예정', {
          symbol,
          eventRisk,
        });
      } else {
        logger.debug('이벤트 리스크 낮음', {
          symbol,
          eventRisk,
        });
      }
    }

    // ========================================
    // 3. 포지션 크기 계산
    // ========================================
    logger.debug('3. 포지션 크기 계산 중...');
    const positionSizingResult = await calculatePositionSizeForBroker(
      {
        symbol,
        riskPercentage: 0.01, // 1% 리스크
        entry,
        stopLoss,
      },
      broker
    );

    positionSize = positionSizingResult.positionSize;
    positionValue = positionSizingResult.positionValue;

    // 이벤트 리스크에 따른 포지션 크기 조정
    if (eventRisk.hasRisk && getRecommendation(eventRisk.riskLevel) === 'reduce_size') {
      positionSize = positionSize.times(0.5);
      positionValue = positionValue.times(0.5);
      logger.info('이벤트 리스크로 포지션 크기 50% 축소', {
        symbol,
        adjustedSize: positionSize.toString(),
        adjustedValue: positionValue.toString(),
      });
    }

    if (positionSizingResult.limitedByMaxExposure) {
      warnings.push('최대 포지션 크기 제한 적용 (계좌의 25%)');
    }

    logger.debug('포지션 크기 계산 완료', {
      positionSize: positionSize.toString(),
      positionValue: positionValue.toString(),
    });

    // ========================================
    // 4. 레버리지 검증
    // ========================================
    logger.debug('4. 레버리지 검증 중...');

    // 3-1. 심볼별 레버리지
    const leverageValidation = await validateLeverage({
      symbol,
      broker,
      positionValue,
    });

    if (!leverageValidation.valid) {
      violations.push(...leverageValidation.violations);
    }

    // 3-2. 포트폴리오 레버리지
    const portfolioLeverageValidation = await validatePortfolioLeverage({
      broker,
      newPositionValue: positionValue,
    });

    if (!portfolioLeverageValidation.valid) {
      violations.push(...portfolioLeverageValidation.violations);
    }

    // ========================================
    // 5. 노출도 검증
    // ========================================
    logger.debug('5. 노출도 검증 중...');

    // 4-1. 심볼별 노출도
    const symbolExposureValidation = await checkSymbolExposure({
      symbol,
      broker,
      positionValue,
    });

    if (!symbolExposureValidation.valid) {
      violations.push(...symbolExposureValidation.violations);
    }

    // 4-2. 총 노출도
    const totalExposureValidation = await checkTotalExposure({
      broker,
      newPositionValue: positionValue,
    });

    if (!totalExposureValidation.valid) {
      violations.push(...totalExposureValidation.violations);
    }

    // ========================================
    // 6. 손절 범위 검증
    // ========================================
    logger.debug('6. 손절 범위 검증 중...');
    const stopLossDistance = entry.minus(stopLoss).abs();
    const stopLossPct = stopLossDistance.div(entry);

    // 시장별 손절 폭 상한: 코인은 변동성이 커서 15%, 주식은 5%
    const maxStopLossPct = market === 'CRYPTO' ? 0.15 : 0.05;
    const maxStopLossLabel = market === 'CRYPTO' ? '15%' : '5%';

    if (stopLossPct.lt(0.005)) {
      violations.push(`손절 폭이 너무 작습니다: ${stopLossPct.times(100).toFixed(2)}% (최소 0.5%)`);
    }

    if (stopLossPct.gt(maxStopLossPct)) {
      violations.push(`손절 폭이 너무 큽니다: ${stopLossPct.times(100).toFixed(2)}% (최대 ${maxStopLossLabel})`);
    }

    // ========================================
    // 7. 결과 종합
    // ========================================
    const approved = violations.length === 0;

    if (!approved) {
      logger.warn('리스크 검증 실패', {
        symbol,
        violations,
      });

      // 리스크 이벤트 로깅
      await logRiskEvent({
        event_type: 'leverage_violation', // TODO: 더 구체적인 타입 추가
        symbol,
        violation_details: {
          violations,
          warnings,
          entry: entry.toString(),
          stopLoss: stopLoss.toString(),
          positionValue: positionValue.toString(),
        },
        severity: 'medium',
      });
    } else {
      logger.info('리스크 검증 통과', {
        symbol,
        positionSize: positionSize.toString(),
        positionValue: positionValue.toString(),
        warnings,
      });
    }

    return {
      approved,
      positionSize,
      positionValue,
      violations,
      warnings,
      circuitBreakerState,
      leverageValidation,
      exposureValidation: totalExposureValidation,
    };
  } catch (error) {
    logger.error('리스크 검증 중 에러 발생', {
      symbol,
      error,
    });

    return {
      approved: false,
      positionSize: new Big(0),
      positionValue: new Big(0),
      violations: ['리스크 검증 중 에러 발생'],
      warnings,
    };
  }
}
