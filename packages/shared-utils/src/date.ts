import { DateTime } from 'luxon';

export function nowIso(): string {
  const iso = DateTime.utc().toISO();
  if (!iso) throw new Error('현재 시각 ISO 변환 실패');
  return iso;
}

export function normalizeUtcIso(utcLike: string): string {
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

export function toIsoString(value: string | DateTime): string {
  const dt = typeof value === 'string' ? DateTime.fromISO(value, { setZone: true }) : value;

  if (!dt.isValid) throw new Error('ISO 변환 실패');

  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error('ISO 변환 실패');
  return iso;
}
