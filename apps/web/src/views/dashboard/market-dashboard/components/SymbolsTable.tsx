import * as React from 'react';
import { DateTime } from 'luxon';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AiResultRow } from '@/types/api/snapshot';
import { formatConfidence, normalizeRisk } from '../utils';

type SymbolsTableProps = {
  rows: AiResultRow[];
  isLoading: boolean;
  isError: boolean;
  selectedId: number | null;
  onSelect: (row: AiResultRow) => void;
};

function formatDateTime(iso: string) {
  const dt = DateTime.fromISO(iso);
  if (!dt.isValid) return '—';
  return dt.toFormat('MM-dd HH:mm');
}

function riskBadgeVariant(level: ReturnType<typeof normalizeRisk>) {
  if (level === 'HIGH') return 'destructive' as const;
  if (level === 'MEDIUM') return 'secondary' as const;
  if (level === 'LOW') return 'outline' as const;
  return 'outline' as const;
}

export default function SymbolsTable({
  rows,
  isLoading,
  isError,
  selectedId,
  onSelect,
}: SymbolsTableProps) {
  return (
    <div className="rounded-xl border bg-white">
      {isError ? (
        <div className="p-4 text-sm text-rose-600">스냅샷 로딩에 실패했습니다.</div>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>symbol</TableHead>
            <TableHead>decision</TableHead>
            <TableHead>confidence</TableHead>
            <TableHead>risk_level</TableHead>
            <TableHead>created_at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <TableRow key={`skeleton-${index}`}>
                <TableCell colSpan={5}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                표시할 결과가 없습니다.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const riskLevel = normalizeRisk(row.risk_level);
              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  data-state={row.id === selectedId ? 'selected' : undefined}
                  onClick={() => onSelect(row)}
                >
                  <TableCell className="font-medium">{row.symbol}</TableCell>
                  <TableCell>{row.decision}</TableCell>
                  <TableCell>{formatConfidence(row.confidence)}</TableCell>
                  <TableCell>
                    <Badge variant={riskBadgeVariant(riskLevel)}>{riskLevel}</Badge>
                  </TableCell>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
