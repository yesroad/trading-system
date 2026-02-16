'use client';

import * as React from 'react';
import { useTradeHistoryQuery } from '@/queries/trade-history';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatLocalDateTime, formatCurrency, formatNumber, sideTone } from './format';

const PAGE_SIZE = 10;

export const TradeHistoryTable = React.memo(function TradeHistoryTable() {
  const [page, setPage] = React.useState(1);

  const { data, isLoading, isError } = useTradeHistoryQuery({
    refetchInterval: 20_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          거래 히스토리 로딩 중...
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-rose-200 bg-rose-50">
        <CardContent className="p-8 text-center text-sm text-rose-700">
          거래 히스토리를 불러오지 못했습니다.
        </CardContent>
      </Card>
    );
  }

  const trades = data.trades;

  if (trades.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>거래 히스토리</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center text-sm text-slate-500">
          거래 내역이 없습니다.
        </CardContent>
      </Card>
    );
  }

  // 페이징 계산
  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedTrades = trades.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const handleNextPage = () => {
    setPage((p) => Math.min(totalPages, p + 1));
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>거래 히스토리</CardTitle>
          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
            총 {trades.length}건
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="pb-2 text-left font-semibold text-slate-600">시간</th>
                <th className="pb-2 text-left font-semibold text-slate-600">심볼</th>
                <th className="pb-2 text-left font-semibold text-slate-600">브로커</th>
                <th className="pb-2 text-left font-semibold text-slate-600">타입</th>
                <th className="pb-2 text-right font-semibold text-slate-600">수량</th>
                <th className="pb-2 text-right font-semibold text-slate-600">가격</th>
                <th className="pb-2 text-left font-semibold text-slate-600">상태</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTrades.map((trade) => (
                <tr key={trade.id} className="border-b border-slate-100">
                  <td className="py-3 text-slate-600">
                    {formatLocalDateTime(trade.created_at)}
                  </td>
                  <td className="py-3 font-semibold text-slate-900">{trade.symbol}</td>
                  <td className="py-3 text-slate-600">{trade.broker}</td>
                  <td className="py-3">
                    <Badge className={sideTone(trade.side)} variant="secondary">
                      {trade.side}
                    </Badge>
                  </td>
                  <td className="py-3 text-right text-slate-900">
                    {formatNumber(trade.executed_qty)}
                  </td>
                  <td className="py-3 text-right font-semibold text-slate-900">
                    {formatCurrency(String(trade.executed_price))}
                  </td>
                  <td className="py-3">
                    <span
                      className={`text-xs ${
                        trade.status === 'filled'
                          ? 'text-emerald-700'
                          : trade.status === 'failed'
                            ? 'text-rose-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {trade.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 페이징 컨트롤 */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handlePrevPage}
              disabled={page === 1}
            >
              이전
            </Button>
            <span className="text-sm text-slate-600">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleNextPage}
              disabled={page >= totalPages}
            >
              다음
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
});
