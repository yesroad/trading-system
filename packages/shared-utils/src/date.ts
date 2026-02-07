import { DateTime } from 'luxon';

export function nowIso(): string {
  const iso = DateTime.now().toISO();
  if (!iso) throw new Error('현재 시각 ISO 변환 실패');
  return iso;
}

export function normalizeUtcIso(utcLike: string): string {
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

export function toIsoString(date: Date): string {
  const iso = DateTime.fromJSDate(date).toUTC().toISO();
  if (!iso) throw new Error('ISO 변환 실패');
  return iso;
}
