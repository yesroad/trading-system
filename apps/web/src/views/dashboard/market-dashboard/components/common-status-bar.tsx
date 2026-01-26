import * as React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { DateTime } from 'luxon';
import type { AiResultRow, IngestionRunRow, PositionRow } from '@/types/api/snapshot';
import { MARKET_META, TAB_ORDER, type MarketKey } from '../constants';
import { formatMinutesAgo, formatStatusLabel, normalizeRisk, pickLatestIngestionRun } from '../utils';

type CommonStatusBarProps = {
  ingestionRuns: IngestionRunRow[];
  aiResults: AiResultRow[];
  lagMinutesMax: number | null | undefined;
  workerStates: string[];
  positions: PositionRow[];
};

export default function CommonStatusBar({
  ingestionRuns,
  aiResults,
  lagMinutesMax,
  workerStates,
  positions,
}: CommonStatusBarProps) {
  const LAG_WARN_MINUTES = 5;
  const overallStatus = React.useMemo<'ok' | 'warn' | 'down'>(() => {
    if (workerStates.some((state) => state === 'failed')) return 'down';
    if (workerStates.some((state) => state !== 'success')) return 'warn';
    if (typeof lagMinutesMax === 'number' && lagMinutesMax >= LAG_WARN_MINUTES) return 'warn';
    return 'ok';
  }, [workerStates, lagMinutesMax]);

  const overallRisk = React.useMemo(() => {
    const acc = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const item of aiResults) {
      const risk = normalizeRisk(item.risk_level);
      if (risk === 'HIGH' || risk === 'MEDIUM' || risk === 'LOW') acc[risk] += 1;
    }
    return acc;
  }, [aiResults]);

  const latestAi = aiResults
    .slice()
    .sort(
      (a, b) =>
        DateTime.fromISO(b.created_at).toMillis() - DateTime.fromISO(a.created_at).toMillis(),
    )[0];

  const ingestionStatus = TAB_ORDER.map((key) => {
    const run = pickLatestIngestionRun(ingestionRuns, MARKET_META[key].ingestionJob);
    const time = run?.finished_at ?? run?.started_at ?? null;
    return `${MARKET_META[key].label} ${formatMinutesAgo(time)}`;
  });

  const holdingCounts = React.useMemo(() => {
    const counts: Record<MarketKey, number> = { CRYPTO: 0, US: 0, KR: 0 };
    const perMarket = new Map<MarketKey, Set<string>>([
      ['CRYPTO', new Set()],
      ['US', new Set()],
      ['KR', new Set()],
    ]);

    for (const pos of positions) {
      if (pos.qty <= 0) continue;
      const market = pos.market as MarketKey;
      if (perMarket.has(market)) perMarket.get(market)?.add(pos.symbol);
    }

    for (const key of TAB_ORDER) {
      counts[key] = perMarket.get(key)?.size ?? 0;
    }

    return counts;
  }, [positions]);

  const statusColor =
    overallStatus === 'down'
      ? 'bg-red-500'
      : overallStatus === 'warn'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  return (
    <Card className="border bg-card/70 shadow-sm">
      <CardContent className="grid gap-3 p-4 text-sm md:grid-cols-5">
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">전체 시스템 상태</div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
            <span>{formatStatusLabel(overallStatus)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            지연 MAX {typeof lagMinutesMax === 'number' ? `${lagMinutesMax}분` : '없음'}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">수집 상태</div>
          <div className="text-sm font-semibold text-foreground">{ingestionStatus.join(' · ')}</div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">AI 분석 상태</div>
          <div className="text-sm font-semibold text-foreground">
            {formatMinutesAgo(latestAi?.created_at)}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">리스크 요약</div>
          <div className="text-sm font-semibold text-foreground">
            HIGH {overallRisk.HIGH} · MEDIUM {overallRisk.MEDIUM} · LOW {overallRisk.LOW}
          </div>
        </div>
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">보유 종목 요약</div>
          <div className="text-sm font-semibold text-foreground">
            코인 {holdingCounts.CRYPTO} · 미장 {holdingCounts.US} · 국장 {holdingCounts.KR}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
