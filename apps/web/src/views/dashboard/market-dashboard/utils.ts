import { DateTime } from 'luxon';
import type { AiResultRow, IngestionRunRow } from '@/types/api/snapshot';

type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export function normalizeRisk(value: string | null | undefined): RiskLevel {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') return upper;
  return 'UNKNOWN';
}

export function formatMinutesAgo(iso: string | null | undefined): string {
  if (!iso) return '데이터 없음';
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  if (!dt.isValid) return '알 수 없음';
  const minutes = Math.max(0, Math.floor(DateTime.utc().diff(dt, 'minutes').minutes));
  if (minutes <= 0) return '방금 전';
  return `${minutes}분 전`;
}

export function formatConfidence(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  const rounded = Math.round(normalized * 10) / 10;
  return `${rounded.toFixed(1)}%`;
}

export function formatStatusLabel(value: 'ok' | 'warn' | 'down') {
  if (value === 'down') return '중단';
  if (value === 'warn') return '지연';
  return '정상';
}

export function riskRank(value: RiskLevel) {
  if (value === 'HIGH') return 3;
  if (value === 'MEDIUM') return 2;
  if (value === 'LOW') return 1;
  return 0;
}

export function buildReasonSummary(reasons: AiResultRow['reasons']): string {
  if (reasons === null || reasons === undefined) return '없음';
  if (typeof reasons === 'string') return reasons;
  if (Array.isArray(reasons)) {
    return (
      reasons
        .slice(0, 3)
        .map((item) => String(item))
        .join(' · ') || '없음'
    );
  }
  if (typeof reasons === 'object') {
    return JSON.stringify(reasons);
  }
  return String(reasons);
}

export function pickLatestIngestionRun(runs: IngestionRunRow[], job: string): IngestionRunRow | null {
  return runs.find((run) => run.job === job) ?? null;
}
