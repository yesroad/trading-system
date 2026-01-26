import * as React from 'react';
import { DateTime } from 'luxon';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { AiResultRow, JsonValue } from '@/types/api/snapshot';
import { formatConfidence, normalizeRisk } from '../utils';

type DetailDrawerProps = {
  open: boolean;
  row: AiResultRow | null;
  onClose: () => void;
};

function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '—';
  return dt.toFormat('yyyy-LL-dd HH:mm:ss');
}

function formatJson(value: JsonValue) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function riskBadgeVariant(level: ReturnType<typeof normalizeRisk>) {
  if (level === 'HIGH') return 'destructive' as const;
  if (level === 'MEDIUM') return 'secondary' as const;
  if (level === 'LOW') return 'outline' as const;
  return 'outline' as const;
}

export default function DetailDrawer({ open, row, onClose }: DetailDrawerProps) {
  if (!open || !row) return null;
  const riskLevel = normalizeRisk(row.risk_level);

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="relative z-50 flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-muted-foreground">symbol</div>
            <div className="text-xl font-semibold text-foreground">{row.symbol}</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            닫기
          </Button>
        </div>

        <div className="grid gap-3 rounded-lg border p-4 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <div className="text-xs text-muted-foreground">decision</div>
              <div className="font-medium text-foreground">{row.decision}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">confidence</div>
              <div className="font-medium text-foreground">{formatConfidence(row.confidence)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">risk_level</div>
              <Badge variant={riskBadgeVariant(riskLevel)}>{riskLevel}</Badge>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">created_at</div>
            <div className="font-medium text-foreground">{formatDateTime(row.created_at)}</div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">summary</div>
          <p className="rounded-lg border bg-muted/20 p-3 text-sm text-foreground">{row.summary}</p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">reasons</div>
          <pre className="max-h-56 overflow-auto rounded-lg border bg-muted/20 p-3 text-xs text-foreground">
            {formatJson(row.reasons)}
          </pre>
        </div>

        <details className="group rounded-lg border bg-white p-3">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
            raw_response 보기
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted/20 p-3 text-xs text-foreground">
            {formatJson(row.raw_response)}
          </pre>
        </details>
      </aside>
    </div>
  );
}
