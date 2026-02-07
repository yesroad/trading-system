import { env } from '../config/env';
import { sendTelegram } from '../alert/sendTelegram';
import {
  fetchPendingNotificationEvents,
  markNotificationEventFailed,
  markNotificationEventSent,
  type NotificationEventRow,
} from '../db/queries';

function normalizeLevel(level: string): 'INFO' | 'WARNING' | 'ERROR' {
  if (level === 'ERROR') return 'ERROR';
  if (level === 'WARNING') return 'WARNING';
  return 'INFO';
}

function normalizeMarket(market: string | null): 'KR' | 'US' | 'CRYPTO' | 'GLOBAL' {
  if (market === 'KR' || market === 'US' || market === 'CRYPTO' || market === 'GLOBAL') return market;
  return 'GLOBAL';
}

function levelEmoji(level: 'INFO' | 'WARNING' | 'ERROR'): string {
  if (level === 'ERROR') return '🔥';
  if (level === 'WARNING') return '⚠️';
  return '✅';
}

function formatExternalNotification(row: NotificationEventRow): string {
  const level = normalizeLevel(row.level);
  const market = normalizeMarket(row.market);

  return [
    `${env.ALERT_PREFIX} ${levelEmoji(level)} ${level}`,
    `- 시장: ${market}`,
    `- 유형: ${row.title}`,
    `- 대상: ${row.source_service}`,
    `- 내용: ${row.message}`,
    `- 시간: ${row.created_at}`,
  ].join('\n');
}

/**
 * trade-executor 등 외부 서비스가 적재한 notification_events를 전송한다.
 */
export async function checkNotificationEvents(): Promise<{ sent: number; failed: number; skipped: number }> {
  if (!env.NOTIFICATION_EVENTS_ENABLED) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const rows = await fetchPendingNotificationEvents(env.NOTIFICATION_EVENTS_LIMIT);
  if (rows.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const text = formatExternalNotification(row);
      const level = normalizeLevel(row.level);

      await sendTelegram(text, { isCriticalRepeat: level === 'ERROR' });
      await markNotificationEventSent(row.id);
      sent += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);

      try {
        await markNotificationEventFailed(row.id, msg);
        failed += 1;
      } catch {
        // 상태 업데이트 실패 시 다음 이벤트 처리 계속
        skipped += 1;
      }
    }
  }

  return { sent, failed, skipped };
}
