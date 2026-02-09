'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { SnapshotItem } from '@/types/api/snapshot';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSnapshotQuery } from '@/queries/snapshot';
import { MarketSummaryGrid } from './market-summary-grid';
import { MarketTabs } from './market-tabs';
import { RiskFilterBar } from './risk-filter-bar';
import { SymbolAccordionList } from './symbol-accordion-list';
import { formatLagMinutes, formatLocalDateTime } from './format';
import { ROUTE_TO_MARKET, type DashboardRouteKey, type RiskFilter } from './types';

function applyFilter(items: SnapshotItem[], filter: RiskFilter): SnapshotItem[] {
  if (filter === 'ALL') return items;
  if (filter === 'HOLDING') return items.filter((item) => item.isHolding);
  return items.filter((item) => item.riskLevel === filter);
}

function parseRiskFilter(raw: string | null): RiskFilter {
  if (raw === 'HIGH' || raw === 'MEDIUM' || raw === 'LOW' || raw === 'HOLDING') return raw;
  return 'ALL';
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

export function DashboardShell({ routeKey }: { routeKey: DashboardRouteKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const riskFilter = parseRiskFilter(searchParams.get('filter'));
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const openIdParam = searchParams.get('open');
  const openId = openIdParam ? Number(openIdParam) : null;

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
  const detail = snapshot.tabs[market];
  const filteredItems = applyFilter(detail.items, riskFilter);

  const handleRiskFilterChange = (next: RiskFilter) => {
    updateSearch({
      filter: next === 'ALL' ? null : next,
      period: null,
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

  const handleOpenChange = (next: number | null) => {
    updateSearch({
      open: next ? String(next) : null,
    });
  };

  return (
    <div className="space-y-4">
      <MarketSummaryGrid snapshot={snapshot} />

      <Card>
        <CardContent className="p-4">
          <MarketTabs active={routeKey} />
          <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
            <p>
              분석 대상 종목:{' '}
              <span className="font-semibold text-slate-900">{detail.targetCount}</span>
            </p>
            <p>
              최근 수집:{' '}
              <span className="font-semibold text-slate-900">
                {formatLagMinutes(detail.ingestionLagMinutes)} (
                {formatLocalDateTime(detail.latestIngestionAtUtc)})
              </span>
            </p>
            <p>
              최근 분석:{' '}
              <span className="font-semibold text-slate-900">
                {formatLagMinutes(detail.analysisLagMinutes)} (
                {formatLocalDateTime(detail.latestAnalysisAtUtc)})
              </span>
            </p>
          </div>

          <div className="mt-3 grid gap-2 text-xs md:grid-cols-3">
            <div className="rounded-xl bg-rose-50 p-3 text-rose-700">
              <Badge variant="secondary" className="bg-rose-100 text-rose-700">
                HIGH {detail.riskCounts.HIGH}
              </Badge>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-700">
              <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                MEDIUM {detail.riskCounts.MEDIUM}
              </Badge>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700">
              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                LOW {detail.riskCounts.LOW}
              </Badge>
            </div>
          </div>

          <div className="mt-3">
            <RiskFilterBar filter={riskFilter} onChange={handleRiskFilterChange} />
          </div>
        </CardContent>
      </Card>

      <SymbolAccordionList
        items={filteredItems}
        page={page}
        openId={Number.isFinite(openId) ? openId : null}
        onPageChange={handlePageChange}
        onOpenChange={handleOpenChange}
      />
    </div>
  );
}
