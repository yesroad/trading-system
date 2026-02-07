import { DateTime } from 'luxon';

export function nowIso(): string {
  return DateTime.now().toISO();
}

export function normalizeUtcIso(utcLike: string): string {
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

export function toIsoString(date: Date): string {
  return date.toISOString();
}
