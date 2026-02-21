import { normalizeUtcIso, type Nullable } from '@workspace/shared-utils';
import { DateTime } from 'luxon';

function toDateTime(value: string | DateTime): DateTime {
  if (typeof value !== 'string') return value;

  const normalized = normalizeUtcIso(value);
  const parsed = DateTime.fromISO(normalized, { setZone: true });
  if (!parsed.isValid) throw new Error(`시간 파싱 실패: ${value}`);
  return parsed;
}

export function diffMinutes(from: string | DateTime, to: string | DateTime) {
  return toDateTime(to).diff(toDateTime(from), 'minutes').minutes;
}

export function toKstIso(value: string | DateTime) {
  return toDateTime(value).setZone('Asia/Seoul').toISO() ?? '';
}

export function toKstDisplay(value: string | DateTime): string {
  return toDateTime(value).setZone('Asia/Seoul').toFormat('yy.MM.dd HH:mm');
}

export function toKstDate(value: string | DateTime): string {
  return toDateTime(value).setZone('Asia/Seoul').toFormat('yy.MM.dd');
}

export function marketLabel(raw: Nullable<string> | undefined): string {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();

  if (value === 'KR' || value === 'KRX' || value === 'KIS') return '국장';
  if (value === 'US' || value === 'YF') return '미장';
  if (value === 'CRYPTO' || value === 'UPBIT') return '코인';
  return '글로벌';
}

export function formatSignedNumber(value: number, fractionDigits = 0): string {
  if (!Number.isFinite(value)) return '0';

  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('ko-KR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });

  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}
