import Big from 'big.js';
import { DateTime } from 'luxon';
import { normalizeUtcIso, type Nullable } from '@workspace/shared-utils';

export function formatLocalDateTime(isoUtc: Nullable<string>): string {
  if (!isoUtc) return 'N/A';
  const dt = DateTime.fromISO(normalizeUtcIso(isoUtc), { zone: 'utc' }).toLocal();
  if (!dt.isValid) return 'N/A';
  return dt.toFormat('yyyy-LL-dd HH:mm:ss');
}

export function formatLagMinutes(minutes: Nullable<number>): string {
  if (minutes === null) return 'N/A';
  if (minutes <= 0) return '방금';
  return `${minutes}분 전`;
}

export function toPercentString(value: string | number | Nullable<number>, fixed = 2): string {
  if (value === null) return 'N/A';
  try {
    return `${new Big(value).toFixed(fixed)}%`;
  } catch {
    return 'N/A';
  }
}

export function formatCurrency(value: Nullable<string>): string {
  if (value === null) return 'N/A';
  try {
    const amount = new Big(value).round(0, 0);
    const numeric = Number(amount.toString());
    if (!Number.isFinite(numeric)) return 'N/A';
    return `${numeric.toLocaleString()}원`;
  } catch {
    return 'N/A';
  }
}

export function formatConfidence(value: string): string {
  try {
    return `${new Big(value).toFixed(1)}%`;
  } catch {
    return 'N/A';
  }
}
