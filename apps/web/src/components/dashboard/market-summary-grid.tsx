import type { OpsSnapshot } from '@/types/api/snapshot';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatLagMinutes, formatLocalDateTime } from './format';

function statusLabel(status: 'ok' | 'warn' | 'down') {
  if (status === 'ok') return '정상';
  if (status === 'warn') return '지연';
  return '중단';
}

function statusDot(status: 'ok' | 'warn' | 'down') {
  if (status === 'ok') return 'bg-emerald-500';
  if (status === 'warn') return 'bg-amber-500';
  return 'bg-rose-500';
}

export function MarketSummaryGrid({ snapshot }: { snapshot: OpsSnapshot }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(['CRYPTO', 'KR', 'US'] as const).map((market) => {
        const summary = snapshot.markets[market];
        return (
          <Card key={market}>
            <CardHeader className="p-4 pb-0">
              <div className="flex items-center justify-between">
                <CardTitle>{market}</CardTitle>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <span className={`h-2.5 w-2.5 rounded-full ${statusDot(summary.status)}`} />
                  {statusLabel(summary.status)}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <p>수집: {formatLagMinutes(summary.ingestionLagMinutes)}</p>
                <p>분석: {formatLagMinutes(summary.analysisLagMinutes)}</p>
                <p>최근 수집 시각: {formatLocalDateTime(summary.latestIngestionAtUtc)}</p>
                <p>최근 분석 시각: {formatLocalDateTime(summary.latestAnalysisAtUtc)}</p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-rose-100 text-rose-700">
                  HIGH {summary.riskCounts.HIGH}
                </Badge>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  MEDIUM {summary.riskCounts.MEDIUM}
                </Badge>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                  LOW {summary.riskCounts.LOW}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
