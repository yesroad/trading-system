import { DateTime } from 'luxon';

function toDateTime(value: string | DateTime): DateTime {
  if (typeof value !== 'string') return value;

  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) throw new Error(`시간 파싱 실패: ${value}`);
  return parsed;
}

export function diffMinutes(from: string | DateTime, to: string | DateTime) {
  return toDateTime(to).diff(toDateTime(from), 'minutes').minutes;
}

export function toKstIso(value: string | DateTime) {
  return toDateTime(value).setZone('Asia/Seoul').toISO() ?? '';
}
