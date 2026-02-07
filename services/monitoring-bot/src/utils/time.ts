import { DateTime } from 'luxon';

function toDateTime(value: string | Date): DateTime {
  if (typeof value === 'string') {
    const parsed = DateTime.fromISO(value, { setZone: true });
    if (!parsed.isValid) throw new Error(`시간 파싱 실패: ${value}`);
    return parsed;
  }
  return DateTime.fromJSDate(value);
}

export function diffMinutes(from: string | Date, to: string | Date) {
  return toDateTime(to).diff(toDateTime(from), 'minutes').minutes;
}

export function toKstIso(value: string | Date) {
  return toDateTime(value).setZone('Asia/Seoul').toISO() ?? '';
}
