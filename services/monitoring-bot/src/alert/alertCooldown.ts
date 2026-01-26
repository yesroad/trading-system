import { env } from '../config/env';
import type { AlertEvent, AlertLevel } from '../types/status';

const sentAt = new Map<string, { at: number; level: AlertLevel }>();

function buildAlertKey(event: AlertEvent) {
  const parts = [event.category, event.market, event.level, event.service ?? '', event.title ?? ''];
  return parts.join('|');
}

export function shouldSendAlert(event: AlertEvent) {
  const key = buildAlertKey(event);
  const now = Date.now();
  const last = sentAt.get(key);
  if (last && now - last.at < env.ALERT_COOLDOWN_MIN * 60000) {
    return { send: false, isCriticalRepeat: false };
  }
  const isCriticalRepeat = event.level === 'CRIT' && last?.level === 'CRIT';
  return { send: true, isCriticalRepeat };
}

export function recordAlertSent(event: AlertEvent) {
  const key = buildAlertKey(event);
  sentAt.set(key, { at: Date.now(), level: event.level });
}
