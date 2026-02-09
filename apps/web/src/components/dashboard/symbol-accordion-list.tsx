import * as React from 'react';
import type { SnapshotItem } from '@/types/api/snapshot';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatConfidence, formatLocalDateTime } from './format';

const PAGE_SIZE = 10;

function riskTone(level: SnapshotItem['riskLevel']) {
  if (level === 'HIGH') return 'bg-rose-100 text-rose-700';
  if (level === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  if (level === 'LOW') return 'bg-emerald-100 text-emerald-700';
  return 'bg-slate-100 text-slate-700';
}

export function SymbolAccordionList({
  items,
  page,
  openId,
  onPageChange,
  onOpenChange,
}: {
  items: SnapshotItem[];
  page: number;
  openId: number | null;
  onPageChange: (next: number) => void;
  onOpenChange: (next: number | null) => void;
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
        value={openId === null ? '' : String(openId)}
        onValueChange={(value) => onOpenChange(value ? Number(value) : null)}
        className="space-y-2"
      >
        {paged.map((item) => (
          <AccordionItem key={item.id} value={String(item.id)}>
            <AccordionTrigger className="touch-manipulation">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900">{item.symbol}</span>
                  {item.isHolding ? (
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700">
                      보유
                    </Badge>
                  ) : null}
                  <Badge variant="secondary" className={riskTone(item.riskLevel)}>
                    {item.riskLevel}
                  </Badge>
                  <Badge variant="secondary">{formatConfidence(item.confidence)}</Badge>
                </div>
                <p className="truncate pt-1 text-xs font-normal text-slate-600">{item.summary}</p>
              </div>
            </AccordionTrigger>
            <AccordionContent className="text-xs text-slate-700">
              <p className="font-semibold text-slate-900">AI 판단: {item.decision}</p>
              <p className="pt-1 text-slate-500">
                분석 시각: {formatLocalDateTime(item.createdAtUtc)}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {(item.reasons.length > 0 ? item.reasons : ['근거 정보 없음'])
                  .slice(0, 3)
                  .map((reason, idx) => (
                    <li key={`${item.id}-reason-${idx}`}>{reason}</li>
                  ))}
              </ul>
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
