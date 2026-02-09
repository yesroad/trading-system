import type { RiskFilter } from './types';
import { Button } from '@/components/ui/button';

const FILTERS: Array<{ key: RiskFilter; label: string }> = [
  { key: 'ALL', label: '전체' },
  { key: 'HIGH', label: 'HIGH' },
  { key: 'MEDIUM', label: 'MEDIUM' },
  { key: 'LOW', label: 'LOW' },
  { key: 'HOLDING', label: '보유 종목만' },
];

export function RiskFilterBar({
  filter,
  onChange,
}: {
  filter: RiskFilter;
  onChange: (next: RiskFilter) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((item) => (
        <Button
          key={item.key}
          type="button"
          size="sm"
          variant={filter === item.key ? 'default' : 'secondary'}
          onClick={() => onChange(item.key)}
          className="rounded-full"
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}
