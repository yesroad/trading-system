import Big from 'big.js';
import type { SnapshotPerformance } from '@/types/api/snapshot';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, toPercentString } from './format';
import { PERFORMANCE_PERIODS } from './types';

export function PerformancePanel({
  period,
  onChange,
  performance,
}: {
  period: keyof SnapshotPerformance;
  onChange: (next: keyof SnapshotPerformance) => void;
  performance: SnapshotPerformance;
}) {
  const metrics = performance[period];

  const pnlTone = (() => {
    if (!metrics.pnlAmount) return 'text-slate-600';
    try {
      return new Big(metrics.pnlAmount).gte(0) ? 'text-emerald-600' : 'text-rose-600';
    } catch {
      return 'text-slate-600';
    }
  })();

  return (
    <Card>
      <CardHeader className="p-4 pb-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>매매 결과(성과)</CardTitle>
          <div className="flex flex-wrap gap-2">
            {PERFORMANCE_PERIODS.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={period === p ? 'default' : 'secondary'}
                onClick={() => onChange(p)}
                className="rounded-full"
              >
                {p === 'DAILY'
                  ? '일간'
                  : p === 'WEEKLY'
                    ? '주간'
                    : p === 'MONTHLY'
                      ? '월간'
                      : '전체'}
              </Button>
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">총 매매 횟수</p>
            <p className="pt-1 font-semibold text-slate-900">{metrics.totalTrades}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">수익/손실 거래</p>
            <p className="pt-1 font-semibold text-slate-900">
              {metrics.winTrades} / {metrics.lossTrades}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">누적 손익</p>
            <p className={`pt-1 font-semibold ${pnlTone}`}>{formatCurrency(metrics.pnlAmount)}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-xs text-slate-500">수익률</p>
            <p className="pt-1 font-semibold text-slate-900">
              {toPercentString(metrics.pnlRatePct)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
