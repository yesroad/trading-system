import Big from 'big.js';
import type { IndicatorScore, ConfidenceResult, ConfidenceAdjustments } from '../types.js';

/**
 * 가중 평균 신뢰도 계산
 *
 * 각 지표의 점수에 가중치를 적용하여 전체 신뢰도를 계산합니다.
 *
 * @param scores - 지표 점수 배열
 * @returns 0-1 범위의 신뢰도
 *
 * @example
 * ```typescript
 * const scores = [
 *   { name: 'MA', score: 0.8, weight: 0.25 },
 *   { name: 'MACD', score: 0.7, weight: 0.20 },
 *   { name: 'RSI', score: 0.6, weight: 0.15 },
 *   { name: 'Volume', score: 0.9, weight: 0.20 },
 *   { name: 'S/R', score: 0.5, weight: 0.20 },
 * ];
 *
 * const confidence = calculateWeightedConfidence(scores);
 * console.log(`신뢰도: ${(confidence * 100).toFixed(2)}%`);
 * ```
 */
export function calculateWeightedConfidence(scores: IndicatorScore[]): number {
  // 가중치 합이 1.0인지 검증
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);

  if (Math.abs(totalWeight - 1.0) > 0.01) {
    throw new Error(`가중치 합이 1.0이 아닙니다: ${totalWeight.toFixed(2)}`);
  }

  // 가중 평균 계산
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);

  return Math.max(0, Math.min(1, weightedSum));
}

/**
 * 다중 시간대 신뢰도 집계
 *
 * @param timeframeScores - 시간대별 신뢰도 맵 (예: { '1h': 0.8, '4h': 0.7, '1d': 0.9 })
 * @returns 집계된 신뢰도 (0-1)
 *
 * @example
 * ```typescript
 * const mtfConfidence = calculateMultiTimeframeConfidence({
 *   '1h': 0.8,
 *   '4h': 0.7,
 *   '1d': 0.9,
 * });
 * ```
 */
export function calculateMultiTimeframeConfidence(
  timeframeScores: Record<string, number>
): number {
  const scores = Object.values(timeframeScores);

  if (scores.length === 0) {
    return 0;
  }

  // 간단한 평균
  const avg = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  return Math.max(0, Math.min(1, avg));
}

/**
 * 변동성 조정 계수 계산
 *
 * 변동성이 높을수록 신뢰도를 낮춤
 *
 * @param atrPercent - ATR 퍼센트 (예: 0.05 = 5%)
 * @returns 조정 계수 (0-1, 1 = 조정 없음)
 */
export function calculateVolatilityAdjustment(atrPercent: Big): number {
  const atr = atrPercent.toNumber();

  // ATR 2% 이하: 조정 없음
  if (atr <= 0.02) {
    return 1.0;
  }

  // ATR 10% 이상: 최대 50% 감소
  if (atr >= 0.10) {
    return 0.5;
  }

  // 선형 보간: 2%~10% 사이
  const factor = (atr - 0.02) / (0.10 - 0.02);
  return 1.0 - (factor * 0.5);
}

/**
 * 추세 강도 조정 계수 계산
 *
 * @param shortMA - 단기 이동평균
 * @param longMA - 장기 이동평균
 * @returns 조정 계수 (0-1)
 */
export function calculateTrendStrengthAdjustment(shortMA: Big, longMA: Big): number {
  // MA 간 거리 계산 (퍼센트)
  const distance = shortMA.minus(longMA).abs().div(longMA);

  const distNum = distance.toNumber();

  // 거리가 5% 이상: 강한 추세 (조정 없음)
  if (distNum >= 0.05) {
    return 1.0;
  }

  // 거리가 0%: 약한 추세 (20% 감소)
  if (distNum <= 0) {
    return 0.8;
  }

  // 선형 보간
  const factor = distNum / 0.05;
  return 0.8 + (factor * 0.2);
}

/**
 * 종합 신뢰도 계산 (조정 적용)
 *
 * @param scores - 지표 점수 배열
 * @param adjustments - 조정 계수들
 * @returns 최종 신뢰도 결과
 *
 * @example
 * ```typescript
 * const result = calculateFinalConfidence(scores, {
 *   volatilityFactor: 0.9,
 *   trendStrength: 0.95,
 *   volumeConfirmation: 1.0,
 * });
 *
 * console.log(`원본 신뢰도: ${(result.rawConfidence * 100).toFixed(2)}%`);
 * console.log(`조정 신뢰도: ${(result.adjustedConfidence * 100).toFixed(2)}%`);
 * ```
 */
export function calculateFinalConfidence(
  scores: IndicatorScore[],
  adjustments: ConfidenceAdjustments
): ConfidenceResult {
  // 원본 신뢰도 계산
  const rawConfidence = calculateWeightedConfidence(scores);

  // 조정 적용
  const adjusted =
    rawConfidence *
    adjustments.volatilityFactor *
    adjustments.trendStrength *
    adjustments.volumeConfirmation;

  const adjustedConfidence = Math.max(0, Math.min(1, adjusted));

  return {
    rawConfidence,
    adjustedConfidence,
    adjustments,
    breakdown: scores,
  };
}

/**
 * 기본 신뢰도 계산 (조정 없음)
 *
 * @param scores - 지표 점수 배열
 * @returns 신뢰도 결과
 */
export function calculateBasicConfidence(scores: IndicatorScore[]): ConfidenceResult {
  const rawConfidence = calculateWeightedConfidence(scores);

  return {
    rawConfidence,
    adjustedConfidence: rawConfidence,
    adjustments: {
      volatilityFactor: 1.0,
      trendStrength: 1.0,
      volumeConfirmation: 1.0,
    },
    breakdown: scores,
  };
}
