'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSnapshotQuery } from '@/queries/snapshot';
import { MarketSummaryGrid } from './market-summary-grid';
import { MarketTabs } from './market-tabs';
import { PerformancePanel } from './performance-panel';
import { SymbolAccordionList } from './symbol-accordion-list';
import { formatCurrency, toPercentString } from './format';
import { ROUTE_TO_MARKET, type DashboardRouteKey } from './types';
import type { SnapshotPerformance } from '@/types/api/snapshot';

function parsePositiveInt(raw: string | null, fallback: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function parsePerformancePeriod(raw: string | null): keyof SnapshotPerformance {
  if (raw === 'DAILY' || raw === 'WEEKLY' || raw === 'MONTHLY' || raw === 'ALL') return raw;
  return 'DAILY';
}

export function DashboardShell({ routeKey }: { routeKey: DashboardRouteKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const period = parsePerformancePeriod(searchParams.get('period'));
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const openIdParam = searchParams.get('open');
  const openId = openIdParam ? String(openIdParam) : null;

  const market = ROUTE_TO_MARKET[routeKey];

  const updateSearch = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([key, value]) => {
        if (value === null || value.length === 0) {
          next.delete(key);
          return;
        }
        next.set(key, value);
      });
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const snapshotQuery = useSnapshotQuery({ refetchInterval: 10_000 });

  if (snapshotQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          대시보드 로딩 중...
        </CardContent>
      </Card>
    );
  }

  if (snapshotQuery.isError || !snapshotQuery.data) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent className="p-8 text-center text-sm text-rose-700">
          스냅샷 데이터를 불러오지 못했습니다.
        </CardContent>
      </Card>
    );
  }

  const snapshot = snapshotQuery.data;
  const marketSummary = snapshot.byMarket[market];
  const marketPositions = snapshot.positions.filter((item) => item.market === market);

  const handlePerformancePeriodChange = (next: keyof SnapshotPerformance) => {
    updateSearch({
      period: next === 'DAILY' ? null : next,
      page: null,
      open: null,
    });
  };

  const handlePageChange = (next: number) => {
    updateSearch({
      page: next <= 1 ? null : String(next),
      open: null,
    });
  };

  const handleOpenChange = (next: string | null) => {
    updateSearch({
      open: next,
    });
  };

  return (
    <div className="space-y-4">
      <MarketSummaryGrid snapshot={snapshot} />
      <PerformancePanel
        period={period}
        onChange={handlePerformancePeriodChange}
        performance={snapshot.performance}
      />

      <Card>
        <CardContent className="p-4">
          <MarketTabs active={routeKey} />
          <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-6">
            <p>
              총 자산:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(snapshot.total.asset)}
              </span>
            </p>
            <p>
              시장 자산:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(marketSummary.asset)}
              </span>
            </p>
            <p>
              총 잔고:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(snapshot.total.cash)}
              </span>
            </p>
            <p>
              시장 잔고:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(marketSummary.cash)}
              </span>
            </p>
            <p>
              총 손익:{' '}
              <span className="font-semibold text-slate-900">
                {formatCurrency(snapshot.total.pnl)}
              </span>
            </p>
            <p>
              총 수익률:{' '}
              <span className="font-semibold text-slate-900">
                {toPercentString(snapshot.total.pnlRatePct)}
              </span>
            </p>
          </div>

          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-3 text-slate-700">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                포지션 {marketSummary.positionCount}
              </Badge>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                미실현 {formatCurrency(marketSummary.unrealizedPnl)}
              </Badge>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-blue-700">
              <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                시장 비중 {toPercentString(marketSummary.weightPct)}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <SymbolAccordionList
        items={marketPositions}
        page={page}
        openId={openId}
        onPageChange={handlePageChange}
        onOpenChange={handleOpenChange}
      />
    </div>
  );
}
