import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { AiResultRow } from '@/types/api/snapshot';
import { type MarketMeta, type RiskFilter } from '../constants';
import { formatMinutesAgo } from '../utils';
import RiskSummary from './risk-summary';

export type MarketSummaryProps = {
  meta: MarketMeta;
  isLoading: boolean;
  latestIngestionTime: string | null;
  latestAi: AiResultRow | null;
  limitedResults: AiResultRow[];
  filter: RiskFilter;
  onFilter: (value: RiskFilter) => void;
};

export default function MarketSummary({
  meta,
  isLoading,
  latestIngestionTime,
  latestAi,
  limitedResults,
  filter,
  onFilter,
}: MarketSummaryProps) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg">{meta.label} 탭 요약</CardTitle>
            <CardDescription>
              대상 {meta.targetCount}개 기준 · 최근 수집 {formatMinutesAgo(latestIngestionTime)} ·
              최근 AI {latestAi ? `${latestAi.mode} · ${formatMinutesAgo(latestAi.created_at)}` : '데이터 없음'}
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
          <RiskSummary items={limitedResults} activeFilter={filter} onFilter={onFilter} />
        )}
      </CardHeader>
    </Card>
  );
}
