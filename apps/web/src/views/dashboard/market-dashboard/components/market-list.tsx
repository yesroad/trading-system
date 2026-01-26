import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AiResultRow } from '@/types/api/snapshot';
import { FILTERS, type RiskFilter } from '../constants';
import { buildReasonSummary, formatConfidence, normalizeRisk } from '../utils';

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

type MarketListProps = {
  filter: RiskFilter;
  onFilter: (value: RiskFilter) => void;
  filteredResults: AiResultRow[];
  holdingsSet: Set<string>;
  isLoading: boolean;
  isError: boolean;
  targetCount: number;
  showRawResponse: boolean;
};

export default function MarketList({
  filter,
  onFilter,
  filteredResults,
  holdingsSet,
  isLoading,
  isError,
  targetCount,
  showRawResponse,
}: MarketListProps) {
  return (
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
                onClick={() => onFilter(item.value)}
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
              {filter === 'HOLDING' ? '보유 종목만 표시합니다.' : `상위 ${targetCount}개 기준`}
            </div>
            {filteredResults.map((row) => {
              const risk = normalizeRisk(row.risk_level);
              const reasonSummary = buildReasonSummary(row.reasons);
              return (
                <Card key={`${row.symbol}-${row.id}`} className="border bg-card/80 py-3 shadow-sm">
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
                      <summary className="cursor-pointer text-muted-foreground">이유 보기</summary>
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
  );
}
