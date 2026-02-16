'use client';

import * as React from 'react';
import { useTradingSignalsQuery } from '@/queries/trading-signals';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatConfidence, signalTypeTone, formatCurrency } from './format';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const TradingSignalsPanel = React.memo(function TradingSignalsPanel() {
  const { data, isLoading, isError } = useTradingSignalsQuery({
    minConfidence: 0.5,
    refetchInterval: 10_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          AI 매매 신호 로딩 중...
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent className="p-8 text-center text-sm text-rose-700">
          AI 매매 신호를 불러오지 못했습니다.
        </CardContent>
      </Card>
    );
  }

  const signals = data.signals.slice(0, 5);

  if (signals.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI 매매 신호</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          현재 대기 중인 신호가 없습니다.
        </CardContent>
      </Card>
    );
  }

  // 차트 데이터 준비
  const chartData = signals.map((signal) => ({
    symbol: signal.symbol,
    confidence: signal.confidence * 100,
    type: signal.signal_type,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>AI 매매 신호</CardTitle>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            평균 신뢰도: {formatConfidence(data.meta.averageConfidence)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* 좌측: 신호 리스트 */}
          <div className="space-y-2">
            {signals.map((signal) => (
              <div key={signal.id} className="rounded-xl bg-slate-50 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">{signal.symbol}</p>
                  <Badge className={signalTypeTone(signal.signal_type)}>
                    {signal.signal_type}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <p className="text-slate-500">신뢰도</p>
                    <p className="font-semibold text-slate-900">
                      {formatConfidence(signal.confidence)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">진입가</p>
                    <p className="font-semibold text-slate-900">
                      {formatCurrency(signal.entry_price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">목표가</p>
                    <p className="font-semibold text-emerald-700">
                      {formatCurrency(signal.target_price)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">손절가</p>
                    <p className="font-semibold text-rose-700">
                      {formatCurrency(signal.stop_loss)}
                    </p>
                  </div>
                </div>
                {signal.reason && (
                  <p className="mt-2 text-xs text-slate-600 line-clamp-2">{signal.reason}</p>
                )}
              </div>
            ))}
          </div>

          {/* 우측: 신뢰도 바 차트 */}
          <div>
            <p className="mb-2 text-xs text-slate-500">신호별 신뢰도</p>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <XAxis dataKey="symbol" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="confidence" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        entry.type === 'BUY'
                          ? '#10b981'
                          : entry.type === 'SELL'
                            ? '#f43f5e'
                            : '#64748b'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
