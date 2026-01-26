import * as React from 'react';
import { DateTime } from 'luxon';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMinutesAgo } from '../utils';

type StatusTone = 'ok' | 'warn' | 'down' | 'unknown';

type KpiStripProps = {
  lagMinutesMax: number | null | undefined;
  ingestionTime: string | null;
  aiTime: string | null;
  riskCounts: { HIGH: number; MEDIUM: number; LOW: number };
  holdingsCount: number;
  isLoading: boolean;
};

const STATUS_COLORS: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  down: 'bg-rose-500',
  unknown: 'bg-muted-foreground/40',
};

function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  if (!dt.isValid) return null;
  const minutes = Math.max(0, Math.floor(DateTime.utc().diff(dt, 'minutes').minutes));
  return minutes;
}

function statusFromMinutes(minutes: number | null): StatusTone {
  if (minutes === null) return 'unknown';
  if (minutes >= 15) return 'down';
  if (minutes >= 5) return 'warn';
  return 'ok';
}

export default function KpiStrip({
  lagMinutesMax,
  ingestionTime,
  aiTime,
  riskCounts,
  holdingsCount,
  isLoading,
}: KpiStripProps) {
  const overallStatus = statusFromMinutes(typeof lagMinutesMax === 'number' ? lagMinutesMax : null);
  const ingestionStatus = statusFromMinutes(minutesSince(ingestionTime));
  const aiStatus = statusFromMinutes(minutesSince(aiTime));

  if (isLoading) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-6 w-28" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white px-4 py-3 text-sm shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">전체 시스템</span>
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[overallStatus]}`} />
        <Badge variant="outline" className="text-xs">
          lag {typeof lagMinutesMax === 'number' ? `${lagMinutesMax}분` : '—'}
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">수집</span>
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[ingestionStatus]}`} />
        <span className="text-xs text-foreground">{formatMinutesAgo(ingestionTime)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">AI 분석</span>
        <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[aiStatus]}`} />
        <span className="text-xs text-foreground">{formatMinutesAgo(aiTime)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">리스크</span>
        <Badge variant="secondary" className="text-xs">HIGH {riskCounts.HIGH}</Badge>
        <Badge variant="outline" className="text-xs">MEDIUM {riskCounts.MEDIUM}</Badge>
        <Badge variant="outline" className="text-xs">LOW {riskCounts.LOW}</Badge>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">보유</span>
        <Badge variant="outline" className="text-xs">{holdingsCount}종목</Badge>
      </div>
    </div>
  );
}
