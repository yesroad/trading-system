import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiResultRow } from '@/types/api/snapshot';
import type { RiskFilter } from '../constants';
import { normalizeRisk } from '../utils';

type RiskSummaryProps = {
  items: AiResultRow[];
  activeFilter: RiskFilter;
  onFilter: (filter: RiskFilter) => void;
};

export default function RiskSummary({ items, activeFilter, onFilter }: RiskSummaryProps) {
  const counts = React.useMemo(() => {
    const acc = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const item of items) {
      acc[normalizeRisk(item.risk_level)] += 1;
    }
    return acc;
  }, [items]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'HIGH' ? 'default' : 'outline'}
        onClick={() => onFilter('HIGH')}
      >
        HIGH {counts.HIGH}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'MEDIUM' ? 'default' : 'outline'}
        onClick={() => onFilter('MEDIUM')}
      >
        MEDIUM {counts.MEDIUM}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'LOW' ? 'default' : 'outline'}
        onClick={() => onFilter('LOW')}
      >
        LOW {counts.LOW}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={activeFilter === 'ALL' ? 'default' : 'outline'}
        onClick={() => onFilter('ALL')}
      >
        전체
      </Button>
      {counts.UNKNOWN > 0 ? <Badge variant="outline">UNKNOWN {counts.UNKNOWN}</Badge> : null}
    </div>
  );
}
