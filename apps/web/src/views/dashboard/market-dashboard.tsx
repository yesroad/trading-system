'use client';

import * as React from 'react';
import { DateTime } from 'luxon';
import { usePathname, useRouter } from 'next/navigation';
import { useGetSnapshot } from '@/queries/snapshot';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { AiResultRow, IngestionRunRow, PositionRow } from '@/types/api/snapshot';

type MarketKey = 'CRYPTO' | 'US' | 'KR';
type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'HOLDING';

type MarketMeta = {
  label: string;
  targetCount: number;
  ingestionJob: string;
  route: string;
};

const MARKET_META: Record<MarketKey, MarketMeta> = {
  CRYPTO: {
    label: '코인',
    targetCount: 30,
    ingestionJob: 'upbit-candle',
    route: '/dashboard/crypto',
  },
  US: {
    label: '미장',
    targetCount: 15,
    ingestionJob: 'yfinance-equity',
    route: '/dashboard/us',
  },
  KR: {
    label: '국장',
    targetCount: 15,
    ingestionJob: 'kis-equity',
    route: '/dashboard/kr',
  },
};

const TAB_ORDER: MarketKey[] = ['CRYPTO', 'US', 'KR'];

const FILTERS: { value: RiskFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'HIGH', label: 'HIGH' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'LOW', label: 'LOW' },
  { value: 'HOLDING', label: '보유만' },
];

type MarketDashboardProps = {
  market: MarketKey;
};

function normalizeRisk(value: string | null | undefined): 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN' {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') return upper;
  return 'UNKNOWN';
}

function formatMinutesAgo(iso: string | null | undefined): string {
  if (!iso) return '데이터 없음';
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  if (!dt.isValid) return '알 수 없음';
  const minutes = Math.max(0, Math.floor(DateTime.utc().diff(dt, 'minutes').minutes));
  if (minutes <= 0) return '방금 전';
  return `${minutes}분 전`;
}

function formatConfidence(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  const rounded = Math.round(normalized * 10) / 10;
  return `${rounded.toFixed(1)}%`;
}

function formatStatusLabel(value: 'ok' | 'warn' | 'down') {
  if (value === 'down') return '중단';
  if (value === 'warn') return '지연';
  return '정상';
}

function riskRank(value: ReturnType<typeof normalizeRisk>) {
  if (value === 'HIGH') return 3;
  if (value === 'MEDIUM') return 2;
  if (value === 'LOW') return 1;
  return 0;
}

function buildReasonSummary(reasons: AiResultRow['reasons']): string {
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

function pickLatestIngestionRun(runs: IngestionRunRow[], job: string): IngestionRunRow | null {
  return runs.find((run) => run.job === job) ?? null;
}

function MarketTabs({ activeMarket }: { activeMarket: MarketKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = TAB_ORDER.find((key) => pathname?.startsWith(MARKET_META[key].route));
  const value = current ?? activeMarket;

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const target = MARKET_META[next as MarketKey];
        if (target) router.push(target.route);
      }}
      className="w-full"
    >
      <TabsList className="w-full justify-start">
        {TAB_ORDER.map((key) => (
          <TabsTrigger key={key} value={key} className="min-w-[88px]">
            {MARKET_META[key].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

function RiskSummary({
  items,
  activeFilter,
  onFilter,
}: {
  items: AiResultRow[];
  activeFilter: RiskFilter;
  onFilter: (filter: RiskFilter) => void;
}) {
  const counts = React.useMemo(() => {
    const acc = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const item of items) {
      acc[normalizeRisk(item.risk_level)] += 1;
    }
    return acc;
  }, [items]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'HIGH' ? 'default' : 'outline'}
        onClick={() => onFilter('HIGH')}
      >
        HIGH {counts.HIGH}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'MEDIUM' ? 'default' : 'outline'}
        onClick={() => onFilter('MEDIUM')}
      >
        MEDIUM {counts.MEDIUM}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'LOW' ? 'default' : 'outline'}
        onClick={() => onFilter('LOW')}
      >
        LOW {counts.LOW}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'ALL' ? 'default' : 'outline'}
        onClick={() => onFilter('ALL')}
      >
        전체
      </Button>
      {counts.UNKNOWN > 0 ? <Badge variant="outline">UNKNOWN {counts.UNKNOWN}</Badge> : null}
    </div>
  );
}

function HoldingsBadge({ symbol, holdings }: { symbol: string; holdings: Set<string> }) {
  if (!holdings.has(symbol)) return null;
  return <Badge variant="secondary">보유</Badge>;
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="text-muted-foreground flex h-28 items-center justify-center rounded-lg border border-dashed">
      {label}
    </div>
  );
}

function CommonStatusBar({
  ingestionRuns,
  aiResults,
  lagMinutesMax,
  workerStates,
  positions,
}: {
  ingestionRuns: IngestionRunRow[];
  aiResults: AiResultRow[];
  lagMinutesMax: number | null | undefined;
  workerStates: string[];
  positions: PositionRow[];
}) {
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

export default function MarketDashboard({ market }: MarketDashboardProps) {
  const [filter, setFilter] = React.useState<RiskFilter>('ALL');
  const { data, isLoading, isError } = useGetSnapshot();
  const meta = MARKET_META[market];

  const aiResults = data?.blocks.aiResults.data ?? [];
  const ingestionRuns = data?.blocks.ingestionRuns.data ?? [];
  const positions = data?.blocks.positions.data ?? [];
  const workerStatus = data?.blocks.workerStatus.data ?? [];
  const lagMinutesMax = data?.meta.lagMinutesMax;
  const workerStates = React.useMemo(() => workerStatus.map((row) => row.state), [workerStatus]);
  const showRawResponse = process.env.NEXT_PUBLIC_DASHBOARD_DEBUG === '1';

  const marketResults = React.useMemo(() => {
    return aiResults.filter((row) => row.market === market);
  }, [aiResults, market]);

  const limitedResults = React.useMemo(
    () =>
      marketResults
        .slice()
        .sort((a, b) => {
          const riskDiff =
            riskRank(normalizeRisk(b.risk_level)) - riskRank(normalizeRisk(a.risk_level));
          if (riskDiff !== 0) return riskDiff;
          return b.confidence - a.confidence;
        })
        .slice(0, meta.targetCount),
    [marketResults, meta.targetCount],
  );

  const holdingsSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of positions) {
      if (p.market === market && p.qty > 0) set.add(p.symbol);
    }
    return set;
  }, [positions, market]);

  const filteredResults = React.useMemo(() => {
    if (filter === 'HOLDING') {
      return limitedResults.filter((row) => holdingsSet.has(row.symbol));
    }
    if (filter === 'ALL') return limitedResults;
    return limitedResults.filter((row) => normalizeRisk(row.risk_level) === filter);
  }, [filter, holdingsSet, limitedResults]);

  const latestIngestion = pickLatestIngestionRun(ingestionRuns, meta.ingestionJob);
  const latestIngestionTime = latestIngestion?.finished_at ?? latestIngestion?.started_at ?? null;
  const latestAi = React.useMemo(
    () =>
      marketResults
        .slice()
        .sort(
          (a, b) =>
            DateTime.fromISO(b.created_at).toMillis() - DateTime.fromISO(a.created_at).toMillis(),
        )[0] ?? null,
    [marketResults],
  );

  return (
    <div className="flex flex-col gap-6 rounded-2xl bg-muted/20 p-4 md:p-6">
      <CommonStatusBar
        ingestionRuns={ingestionRuns}
        aiResults={aiResults}
        lagMinutesMax={lagMinutesMax}
        workerStates={workerStates}
        positions={positions}
      />
      <MarketTabs activeMarket={market} />

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-lg">{meta.label} 탭 요약</CardTitle>
              <CardDescription>
                대상 {meta.targetCount}개 기준 · 최근 수집 {formatMinutesAgo(latestIngestionTime)} ·
                최근 AI{' '}
                {latestAi
                  ? `${latestAi.mode} · ${formatMinutesAgo(latestAi.created_at)}`
                  : '데이터 없음'}
              </CardDescription>
            </div>
            <Badge variant="outline">스냅샷</Badge>
          </div>
          <Separator />
          {isLoading ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
              <Skeleton className="h-9" />
            </div>
          ) : (
            <RiskSummary items={limitedResults} activeFilter={filter} onFilter={setFilter} />
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-base">종목 리스트</CardTitle>
              <CardDescription>종목 / 위험도 / 신뢰도 / 요약</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((item) => (
                <Button
                  key={item.value}
                  type="button"
                  variant={filter === item.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilter(item.value)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? <EmptyState label="스냅샷 로딩에 실패했습니다." /> : null}
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          ) : filteredResults.length === 0 ? (
            <EmptyState label="표시할 종목이 없습니다." />
          ) : (
            <div className="space-y-3">
              <div className="text-muted-foreground text-xs">
                {filter === 'HOLDING'
                  ? '보유 종목만 표시합니다.'
                  : `상위 ${meta.targetCount}개 기준`}
              </div>
              {filteredResults.map((row) => {
                const risk = normalizeRisk(row.risk_level);
                const reasonSummary = buildReasonSummary(row.reasons);
                return (
                  <Card
                    key={`${row.symbol}-${row.id}`}
                    className="border bg-card/80 py-3 shadow-sm"
                  >
                    <CardContent className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">종목</span>
                          <span className="text-sm font-semibold">{row.symbol}</span>
                          <HoldingsBadge symbol={row.symbol} holdings={holdingsSet} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-muted-foreground">위험도</span>
                          <Badge
                            variant={
                              risk === 'HIGH'
                                ? 'destructive'
                                : risk === 'MEDIUM'
                                  ? 'secondary'
                                  : 'outline'
                            }
                          >
                            {risk}
                          </Badge>
                          <span className="text-xs text-muted-foreground">신뢰도</span>
                          <Badge variant="outline">{formatConfidence(row.confidence)}</Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        <span className="text-xs text-muted-foreground">요약</span>
                        <div>{row.summary}</div>
                      </div>
                      <details className="text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          이유 보기
                        </summary>
                        <div className="mt-2 space-y-2">
                          <div className="line-clamp-3 text-[11px] text-muted-foreground">
                            {reasonSummary}
                          </div>
                          {showRawResponse ? (
                            <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 text-[11px]">
                              {JSON.stringify(row.raw_response, null, 2)}
                            </pre>
                          ) : null}
                        </div>
                      </details>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
