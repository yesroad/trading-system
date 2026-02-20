import { createLogger } from '@workspace/shared-utils';
import { checkUpcomingEarnings } from './ai-analyzer-helper.js';

const logger = createLogger('trade-executor-helper');

/**
 * Trade Executor가 사용할 수 있는 헬퍼 함수들
 */

export type EventRiskResult = {
  hasRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  reason: string;
  event: {
    title: string;
    publishedAt: string;
    impactScore: number;
  } | null;
};

/**
 * 거래 전 이벤트 리스크 체크
 *
 * 향후 24시간 이내 실적 발표가 있는 경우 거래를 차단하거나 경고합니다.
 *
 * @param symbol - 종목 심볼
 * @returns 이벤트 리스크 결과
 */
export async function checkEventRisk(symbol: string): Promise<EventRiskResult> {
  logger.debug('이벤트 리스크 체크 시작', { symbol });

  // 향후 24시간 이내 실적 발표 체크
  const earningsEvent = await checkUpcomingEarnings(symbol);

  if (!earningsEvent) {
    logger.debug('향후 24시간 이내 실적 발표 없음', { symbol });
    return {
      hasRisk: false,
      riskLevel: 'low',
      reason: '향후 24시간 이내 주요 이벤트 없음',
      event: null,
    };
  }

  // 실적 발표가 있는 경우
  const impactScore = earningsEvent.impactScore;

  // 임팩트 점수에 따라 리스크 레벨 결정
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (impactScore >= 8) {
    riskLevel = 'high';
  } else if (impactScore >= 5) {
    riskLevel = 'medium';
  }

  const reason = `24시간 이내 실적 발표 예정 (${earningsEvent.publishedAt}, 임팩트: ${impactScore}/10)`;

  logger.warn('이벤트 리스크 감지', {
    symbol,
    riskLevel,
    impactScore,
    publishedAt: earningsEvent.publishedAt,
  });

  return {
    hasRisk: true,
    riskLevel,
    reason,
    event: {
      title: earningsEvent.title,
      publishedAt: earningsEvent.publishedAt,
      impactScore: earningsEvent.impactScore,
    },
  };
}

/**
 * 리스크 레벨에 따른 거래 권장사항
 *
 * @param riskLevel - 리스크 레벨
 * @returns 권장사항
 */
export function getRecommendation(
  riskLevel: 'low' | 'medium' | 'high',
): 'proceed' | 'reduce_size' | 'block' {
  switch (riskLevel) {
    case 'low':
      return 'proceed'; // 거래 진행
    case 'medium':
      return 'reduce_size'; // 포지션 크기 50% 축소
    case 'high':
      return 'block'; // 거래 차단
    default:
      return 'proceed';
  }
}
