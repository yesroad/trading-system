import { getSupabase } from '@workspace/db-client';
import { nowIso, toIsoString } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import { toKstIso } from '../utils/time.js';
import type { AlertEvent } from '../types/status.js';

/**
 * risk_events 테이블 체크
 *
 * - 최근 10분 내 circuit_breaker 발동 시 CRIT
 * - 최근 10분 내 leverage_violation 시 WARN
 */
export async function checkRiskEvents(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();

  const tenMinutesAgo = toIsoString(DateTime.now().minus({ minutes: 10 }).toUTC());

  // 최근 10분 내 리스크 이벤트 조회
  const { data: recentEvents, error } = await supabase
    .from('risk_events')
    .select('*')
    .gte('created_at', tenMinutesAgo)
    .order('created_at', { ascending: false });

  if (error) {
    events.push({
      level: 'CRIT',
      category: 'risk_events_error',
      title: '리스크 이벤트 조회 실패',
      message: `risk_events 조회 중 에러: ${error.message}`,
      market: 'GLOBAL' as const,
      at: nowIso(),
    });
    return events;
  }

  if (!recentEvents || recentEvents.length === 0) {
    return events; // 최근 리스크 이벤트 없음 - 정상
  }

  // Circuit breaker 체크
  const circuitBreakerEvents = recentEvents.filter(
    (e) => e.event_type === 'circuit_breaker' || e.event_type === 'circuit_breaker_triggered',
  );

  if (circuitBreakerEvents.length > 0) {
    const latest = circuitBreakerEvents[0];
    events.push({
      level: 'CRIT',
      category: 'circuit_breaker',
      title: '🚨 서킷 브레이커 발동',
      message: [
        `발동 시각: ${toKstIso(latest.created_at)}`,
        `상세: ${JSON.stringify(latest.violation_details, null, 2)}`,
        '조치: 거래 자동 중단, 모든 포지션 청산',
      ].join('\n'),
      market: 'GLOBAL' as const,
      at: nowIso(),
    });
  }

  return events;
}
