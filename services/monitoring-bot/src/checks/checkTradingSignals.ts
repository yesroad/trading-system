import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import { diffMinutes, toKstIso } from '../utils/time.js';
import type { AlertEvent } from '../types/status.js';

/**
 * trading_signals 테이블 체크
 *
 * - 미소비 신호가 30분 이상 쌓여있으면 WARN
 * - 미소비 신호가 60분 이상이면 CRIT
 */
export async function checkTradingSignals(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();

  // 미소비 신호 조회
  const { data: unconsumedSignals, error } = await supabase
    .from('trading_signals')
    .select('id, symbol, created_at, confidence')
    .is('consumed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    events.push({
      level: 'WARN',
      category: 'trading_signals_error',
      title: '신호 조회 실패',
      message: `trading_signals 조회 중 에러: ${error.message}`,
      market: "GLOBAL" as const,
      at: nowIso(),
    });
    return events;
  }

  if (!unconsumedSignals || unconsumedSignals.length === 0) {
    return events; // 미소비 신호 없음 - 정상
  }

  // 가장 오래된 신호 확인
  const oldestSignal = unconsumedSignals[0];
  const ageMinutes = diffMinutes(oldestSignal.created_at, nowIso());

  if (ageMinutes >= 60) {
    events.push({
      level: 'CRIT',
      category: 'trading_signals_stale',
      title: '신호 소비 지연 (심각)',
      message: [
        `미소비 신호: ${unconsumedSignals.length}개`,
        `가장 오래된 신호: ${oldestSignal.symbol} (${toKstIso(oldestSignal.created_at)})`,
        `경과: ${ageMinutes.toFixed(1)}분`,
        '원인: trade-executor 동작 중지 또는 리스크 검증 실패',
      ].join('\n'),
      market: "GLOBAL" as const,
      at: nowIso(),
    });
  } else if (ageMinutes >= 30) {
    events.push({
      level: 'WARN',
      category: 'trading_signals_stale',
      title: '신호 소비 지연',
      message: [
        `미소비 신호: ${unconsumedSignals.length}개`,
        `가장 오래된 신호: ${oldestSignal.symbol} (${toKstIso(oldestSignal.created_at)})`,
        `경과: ${ageMinutes.toFixed(1)}분`,
      ].join('\n'),
      market: "GLOBAL" as const,
      at: nowIso(),
    });
  }

  return events;
}
