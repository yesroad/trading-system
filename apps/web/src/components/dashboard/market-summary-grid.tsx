import type { OpsSnapshot } from '@/types/api/snapshot';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, toPercentString } from './format';

export function MarketSummaryGrid({ snapshot }: { snapshot: OpsSnapshot }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {(['CRYPTO', 'KR', 'US'] as const).map((market) => {
        const summary = snapshot.byMarket[market];
        const health = snapshot.marketHealth[market];
        return (
          <Card key={market}>
            <CardHeader className="p-4 pb-0">
              <div className="flex items-center justify-between">
                <CardTitle>{market}</CardTitle>
                <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                  <span>비중 {toPercentString(summary.weightPct)}</span>
                  <Badge
                    variant="secondary"
                    className={
                      health.healthy
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }
                  >
                    {health.healthy ? '정상 동작' : '점검 필요'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                <p>자산: {formatCurrency(summary.asset)}</p>
                <p>원금: {formatCurrency(summary.invested)}</p>
                <p>실현 손익: {formatCurrency(summary.realizedPnl)}</p>
                <p>미실현 손익: {formatCurrency(summary.unrealizedPnl)}</p>
                <p>
                  워커 상태: {health.state ?? '-'} ({health.reason})
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                  포지션 {summary.positionCount}
                </Badge>
                <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                  손익 {formatCurrency(summary.pnl)}
                </Badge>
                <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
                  수익률 {toPercentString(summary.pnlRatePct)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
