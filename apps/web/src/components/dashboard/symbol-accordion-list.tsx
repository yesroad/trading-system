import * as React from 'react';
import Big from 'big.js';
import type { SnapshotPosition } from '@/types/api/snapshot';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency, formatLocalDateTime, toPercentString } from './format';

const PAGE_SIZE = 10;

function pnlTone(value: string | null) {
  if (value === null) return 'bg-slate-100 text-slate-700';
  try {
    return new Big(value).gte(0) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  } catch {
    return 'bg-slate-100 text-slate-700';
  }
}

function brokerTone(broker: string) {
  const key = broker.toUpperCase();
  if (key === 'UPBIT') return 'bg-amber-100 text-amber-700';
  if (key === 'KIS') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

export function SymbolAccordionList({
  items,
  page,
  openId,
  onPageChange,
  onOpenChange,
}: {
  items: SnapshotPosition[];
  page: number;
  openId: string | null;
  onPageChange: (next: number) => void;
  onOpenChange: (next: string | null) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-slate-500">
          표시할 종목이 없습니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-3">
      <Accordion
        type="single"
        collapsible
        value={openId === null ? '' : openId}
        onValueChange={(value) => onOpenChange(value || null)}
        className="space-y-2"
      >
        {paged.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="touch-manipulation">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{item.symbol}</span>
                  <Badge variant="secondary" className={brokerTone(item.broker)}>
                    {item.broker}
                  </Badge>
                  <Badge variant="secondary" className={pnlTone(item.pnl)}>
                    {toPercentString(item.pnlRatePct)}
                  </Badge>
                </div>
                <p className="truncate pt-1 text-xs font-normal text-slate-600">
                  수량 {item.qty} | 평가액 {formatCurrency(item.marketValue)}
                </p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-slate-700">
              <p className="font-semibold text-slate-900">
                실현 {formatCurrency(item.realizedPnl)} | 미실현{' '}
                {formatCurrency(item.unrealizedPnl)}
              </p>
              <p className="pt-1 text-slate-500">
                포지션 시각: {formatLocalDateTime(item.updatedAtUtc)}
              </p>
              <div className="mt-2 grid gap-1 rounded-lg bg-slate-50 p-2 text-slate-700">
                <p>평단가: {formatCurrency(item.avgPrice)}</p>
                <p>현재가: {formatCurrency(item.currentPrice)}</p>
                <p>원금: {formatCurrency(item.invested)}</p>
                <p>현재가 시각: {formatLocalDateTime(item.priceUpdatedAtUtc)}</p>
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <Card>
        <CardContent className="flex items-center justify-between px-4 py-3 text-xs text-slate-600">
          <span>
            페이지 {safePage} / {pageCount} (총 {items.length}건)
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
            >
              이전
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
              disabled={safePage >= pageCount}
            >
              다음
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
