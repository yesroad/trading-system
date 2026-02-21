import { getSupabase, getSignalFailureStats } from '@workspace/db-client';
import { nowIso, toIsoString } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import type { AlertEvent } from '../types/status.js';

/**
 * 신호 생성 실패율 체크
 *
 * - 최근 24시간 내 신호 생성 실패율 30% 이상 → WARN
 * - 최근 24시간 내 신호 생성 실패율 50% 이상 → CRIT
 */
export async function checkSignalFailures(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();

  // 최근 24시간 AI 분석 결과 수 조회
  const twentyFourHoursAgo = toIsoString(DateTime.now().minus({ hours: 24 }).toUTC());

  const { data: aiResults, error: aiError } = await supabase
    .from('ai_analysis_results')
    .select('id')
    .gte('created_at', twentyFourHoursAgo)
    .in('decision', ['BUY', 'SELL']); // SKIP, HOLD 제외

  if (aiError) {
    events.push({
      level: 'WARN',
      category: 'signal_failures_error',
      market: 'GLOBAL',
      title: 'AI 분석 결과 조회 실패',
      message: `ai_analysis_results 조회 중 에러: ${aiError.message}`,
      at: nowIso(),
    });
    return events;
  }

  const totalAiAnalysis = aiResults?.length ?? 0;

  if (totalAiAnalysis === 0) {
    return events; // AI 분석 없음 - 정상 (또는 비활성)
  }

  // 신호 생성 실패 통계 조회
  try {
    const failureStats = await getSignalFailureStats({ hoursAgo: 24 });
    const { totalFailures, byType } = failureStats;

    if (totalFailures === 0) {
      return events; // 실패 없음 - 정상
    }

    const failureRate = (totalFailures / totalAiAnalysis) * 100;

    if (failureRate >= 50) {
      events.push({
        level: 'CRIT',
        category: 'signal_failure_rate_high',
        market: 'GLOBAL',
        title: '신호 생성 실패율 높음 (심각)',
        message: [
          `최근 24시간 AI 분석: ${totalAiAnalysis}건`,
          `신호 생성 실패: ${totalFailures}건 (${failureRate.toFixed(1)}%)`,
          ``,
          `실패 유형별:`,
          `- 검증 실패: ${byType.validation_failed}건`,
          `- 기술적 지표 부족: ${byType.insufficient_technical_data}건`,
          `- ATR 없음: ${byType.atr_missing}건`,
          `- 에러: ${byType.error}건`,
          ``,
          `조치 필요: 캔들 데이터 수집 확인, 기술적 지표 계산 로직 점검`,
        ].join('\n'),
        at: nowIso(),
      });
    } else if (failureRate >= 30) {
      events.push({
        level: 'WARN',
        category: 'signal_failure_rate_high',
        market: 'GLOBAL',
        title: '신호 생성 실패율 높음',
        message: [
          `최근 24시간 AI 분석: ${totalAiAnalysis}건`,
          `신호 생성 실패: ${totalFailures}건 (${failureRate.toFixed(1)}%)`,
          ``,
          `실패 유형별:`,
          `- 검증 실패: ${byType.validation_failed}건`,
          `- 기술적 지표 부족: ${byType.insufficient_technical_data}건`,
          `- ATR 없음: ${byType.atr_missing}건`,
          `- 에러: ${byType.error}건`,
        ].join('\n'),
        at: nowIso(),
      });
    }
  } catch (error) {
    events.push({
      level: 'WARN',
      category: 'signal_failures_error',
      market: 'GLOBAL',
      title: '신호 실패율 조회 실패',
      message: `getSignalFailureStats 호출 중 에러: ${error instanceof Error ? error.message : String(error)}`,
      at: nowIso(),
    });
  }

  return events;
}
