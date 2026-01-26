import * as React from 'react';
import { DateTime } from 'luxon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import MarketTabs from './market-tabs';
import type { MarketKey } from '../constants';

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

type ControlsBarProps = {
  market: MarketKey;
  search: string;
  onSearch: (value: string) => void;
  riskFilter: RiskFilter;
  onRiskFilter: (value: RiskFilter) => void;
  autoRefreshEnabled: boolean;
  onToggleAutoRefresh: (value: boolean) => void;
  refreshIntervalSec: number;
  onRefreshInterval: (value: number) => void;
  refreshOptions: readonly number[];
  lastUpdatedAt: string | null;
  isFetching: boolean;
  isError: boolean;
};

const FILTERS: { value: RiskFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'HIGH', label: 'HIGH' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'LOW', label: 'LOW' },
];

function formatUpdatedAt(iso: string | null) {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '—';
  return dt.toFormat('HH:mm:ss');
}

export default function ControlsBar({
  market,
  search,
  onSearch,
  riskFilter,
  onRiskFilter,
  autoRefreshEnabled,
  onToggleAutoRefresh,
  refreshIntervalSec,
  onRefreshInterval,
  refreshOptions,
  lastUpdatedAt,
  isFetching,
  isError,
}: ControlsBarProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MarketTabs activeMarket={market} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <input
              value={search}
              onChange={(event) => onSearch(event.target.value)}
              placeholder="심볼 검색"
              className="h-9 w-44 rounded-md border border-input bg-white px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex flex-wrap items-center gap-1">
            {FILTERS.map((item) => (
              <Button
                key={item.value}
                type="button"
                size="sm"
                variant={riskFilter === item.value ? 'default' : 'outline'}
                onClick={() => onRiskFilter(item.value)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span>자동 새로고침</span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant={autoRefreshEnabled ? 'default' : 'outline'}
              onClick={() => onToggleAutoRefresh(true)}
            >
              ON
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!autoRefreshEnabled ? 'default' : 'outline'}
              onClick={() => onToggleAutoRefresh(false)}
            >
              OFF
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {refreshOptions.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={refreshIntervalSec === value ? 'secondary' : 'ghost'}
                onClick={() => onRefreshInterval(value)}
                disabled={!autoRefreshEnabled}
              >
                {value}s
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isFetching ? <Badge variant="outline">업데이트 중</Badge> : null}
          {isError ? <Badge variant="destructive">에러</Badge> : null}
          <span>마지막 갱신 {formatUpdatedAt(lastUpdatedAt)}</span>
        </div>
      </div>
    </div>
  );
}
