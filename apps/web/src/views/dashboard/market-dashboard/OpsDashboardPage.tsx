'use client';

import * as React from 'react';
import { DateTime } from 'luxon';
import { useGetSnapshot } from '@/queries/snapshot';
import type { AiResultRow, IngestionRunRow } from '@/types/api/snapshot';
import { MARKET_META, type MarketKey } from './constants';
import { normalizeRisk, riskRank } from './utils';
import KpiStrip from './components/KpiStrip';
import ControlsBar from './components/ControlsBar';
import SymbolsTable from './components/SymbolsTable';
import DetailDrawer from './components/DetailDrawer';

const AUTO_REFRESH_OPTIONS = [5, 10, 30] as const;

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

type OpsDashboardPageProps = {
  market: MarketKey;
};

function getTimestamp(run: IngestionRunRow): string | null {
  return run.finished_at ?? run.started_at ?? null;
}

function findLatestIngestion(runs: IngestionRunRow[], job: string): IngestionRunRow | null {
  const candidates = runs.filter((run) => run.job === job);
  if (candidates.length === 0) return null;

  const success = candidates.filter((run) => run.status === 'success');
  const list = success.length > 0 ? success : candidates;

  return list.reduce<IngestionRunRow | null>((latest, current) => {
    if (!latest) return current;
    const latestTs = getTimestamp(latest);
    const currentTs = getTimestamp(current);
    if (!latestTs) return current;
    if (!currentTs) return latest;
    return DateTime.fromISO(currentTs).toMillis() > DateTime.fromISO(latestTs).toMillis()
      ? current
      : latest;
  }, null);
}

export default function OpsDashboardPage({ market }: OpsDashboardPageProps) {
  const [riskFilter, setRiskFilter] = React.useState<RiskFilter>('ALL');
  const [search, setSearch] = React.useState('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = React.useState(true);
  const [refreshIntervalSec, setRefreshIntervalSec] = React.useState<(typeof AUTO_REFRESH_OPTIONS)[number]>(
    10,
  );
  const [selected, setSelected] = React.useState<AiResultRow | null>(null);

  const { data, isLoading, isError, isFetching, dataUpdatedAt } = useGetSnapshot({
    refetchInterval: autoRefreshEnabled ? refreshIntervalSec * 1000 : false,
  });

  const meta = MARKET_META[market];
  const aiResults = data?.blocks.aiResults.data ?? [];
  const ingestionRuns = data?.blocks.ingestionRuns.data ?? [];
  const positions = data?.blocks.positions.data ?? [];
  const lagMinutesMax = data?.meta.lagMinutesMax;

  const marketResults = React.useMemo(
    () => aiResults.filter((row) => row.market === market),
    [aiResults, market],
  );

  const sortedResults = React.useMemo(() => {
    return marketResults
      .slice()
      .sort((a, b) => {
        const riskDiff = riskRank(normalizeRisk(b.risk_level)) - riskRank(normalizeRisk(a.risk_level));
        if (riskDiff !== 0) return riskDiff;
        const confidenceDiff = b.confidence - a.confidence;
        if (confidenceDiff !== 0) return confidenceDiff;
        return DateTime.fromISO(b.created_at).toMillis() - DateTime.fromISO(a.created_at).toMillis();
      })
      .slice(0, meta.targetCount);
  }, [marketResults, meta.targetCount]);

  const riskCounts = React.useMemo(() => {
    const acc = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const item of sortedResults) {
      const level = normalizeRisk(item.risk_level);
      if (level === 'HIGH' || level === 'MEDIUM' || level === 'LOW') {
        acc[level] += 1;
      }
    }
    return acc;
  }, [sortedResults]);

  const holdingsCount = React.useMemo(() => {
    const set = new Set<string>();
    for (const pos of positions) {
      if (pos.market === market && pos.qty > 0) set.add(pos.symbol);
    }
    return set.size;
  }, [positions, market]);

  const latestIngestion = React.useMemo(
    () => findLatestIngestion(ingestionRuns, meta.ingestionJob),
    [ingestionRuns, meta.ingestionJob],
  );

  const latestAi = React.useMemo(() => {
    return (
      marketResults
        .slice()
        .sort(
          (a, b) =>
            DateTime.fromISO(b.created_at).toMillis() - DateTime.fromISO(a.created_at).toMillis(),
        )[0] ?? null
    );
  }, [marketResults]);

  const filteredResults = React.useMemo(() => {
    const needle = search.trim().toUpperCase();
    return sortedResults.filter((row) => {
      const matchesSearch = needle.length === 0 || row.symbol.toUpperCase().includes(needle);
      if (!matchesSearch) return false;
      if (riskFilter === 'ALL') return true;
      return normalizeRisk(row.risk_level) === riskFilter;
    });
  }, [riskFilter, search, sortedResults]);

  const lastUpdatedAt = React.useMemo(() => {
    if (data?.meta.generatedAt) return data.meta.generatedAt;
    if (!dataUpdatedAt) return null;
    return DateTime.fromMillis(dataUpdatedAt).toISO();
  }, [data?.meta.generatedAt, dataUpdatedAt]);

  React.useEffect(() => {
    if (!selected) return;
    const next = filteredResults.find((row) => row.id === selected.id) ?? null;
    if (!next) setSelected(null);
  }, [filteredResults, selected]);

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-border/60 md:p-6">
      <KpiStrip
        lagMinutesMax={lagMinutesMax}
        ingestionTime={latestIngestion ? getTimestamp(latestIngestion) : null}
        aiTime={latestAi?.created_at ?? null}
        riskCounts={riskCounts}
        holdingsCount={holdingsCount}
        isLoading={isLoading}
      />

      <ControlsBar
        market={market}
        search={search}
        onSearch={setSearch}
        riskFilter={riskFilter}
        onRiskFilter={setRiskFilter}
        autoRefreshEnabled={autoRefreshEnabled}
        onToggleAutoRefresh={setAutoRefreshEnabled}
        refreshIntervalSec={refreshIntervalSec}
        onRefreshInterval={setRefreshIntervalSec}
        refreshOptions={AUTO_REFRESH_OPTIONS}
        lastUpdatedAt={lastUpdatedAt}
        isFetching={isFetching}
        isError={isError}
      />

      <SymbolsTable
        rows={filteredResults}
        isLoading={isLoading}
        isError={isError}
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
      />

      <DetailDrawer
        open={Boolean(selected)}
        row={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
