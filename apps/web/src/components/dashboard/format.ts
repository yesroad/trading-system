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

export function formatConfidence(value: string | number): string {
  try {
    const num = typeof value === 'number' ? value * 100 : new Big(value).times(100);
    return `${new Big(num).toFixed(1)}%`;
  } catch {
    return 'N/A';
  }
}

export function formatNumber(value: number | string, decimals = 2): string {
  try {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (!Number.isFinite(num)) return 'N/A';
    return num.toFixed(decimals);
  } catch {
    return 'N/A';
  }
}

export function signalTypeTone(type: 'BUY' | 'SELL' | 'HOLD'): string {
  const tones = {
    BUY: 'bg-emerald-100 text-emerald-700',
    SELL: 'bg-rose-100 text-rose-700',
    HOLD: 'bg-slate-100 text-slate-700',
  };
  return tones[type];
}

export function severityTone(severity: 'low' | 'medium' | 'high' | 'critical'): string {
  const tones = {
    low: 'bg-slate-100 text-slate-700',
    medium: 'bg-blue-100 text-blue-700',
    high: 'bg-amber-100 text-amber-700',
    critical: 'bg-rose-100 text-rose-700',
  };
  return tones[severity];
}

export function sideTone(side: 'BUY' | 'SELL'): string {
  return side === 'BUY'
    ? 'bg-emerald-100 text-emerald-700'
    : 'bg-rose-100 text-rose-700';
}
