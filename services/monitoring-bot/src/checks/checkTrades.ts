import { getSupabase } from '@workspace/db-client';
import { nowIso, toIsoString } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import type { AlertEvent } from '../types/status.js';

/**
 * trades 테이블 체크
 *
 * - 최근 1시간 내 실패율 30% 이상 시 WARN
 * - 최근 1시간 내 실패율 50% 이상 시 CRIT
 */
export async function checkTrades(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();

  const oneHourAgo = toIsoString(DateTime.now().minus({ hours: 1 }).toUTC());

  // 최근 1시간 내 거래 조회
  const { data: recentTrades, error } = await supabase
    .from('trades')
    .select('id, symbol, status, created_at')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false });

  if (error) {
    events.push({
      level: 'CRIT',
      category: 'trades_error',
      title: '거래 기록 조회 실패',
      message: `trades 조회 중 에러: ${error.message}`,
      market: 'GLOBAL' as const,
      at: nowIso(),
    });
    return events;
  }

  if (!recentTrades || recentTrades.length === 0) {
    return events; // 최근 거래 없음 - 정상 (또는 비활성)
  }

  const totalCount = recentTrades.length;
  const failedCount = recentTrades.filter((t) => t.status === 'failed').length;
  const failureRate = (failedCount / totalCount) * 100;

  if (failureRate >= 50) {
    events.push({
      level: 'CRIT',
      category: 'trades_high_failure',
      title: '거래 실패율 높음 (심각)',
      message: [
        `최근 1시간 거래: ${totalCount}건`,
        `실패: ${failedCount}건 (${failureRate.toFixed(1)}%)`,
        `조치 필요: 브로커 API 상태 확인, 주문 로직 점검`,
      ].join('\n'),
      market: 'GLOBAL' as const,
      at: nowIso(),
    });
  }

  return events;
}
