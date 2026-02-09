import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ROUTE_LABEL, ROUTE_ORDER, type DashboardRouteKey } from './types';

export function MarketTabs({ active }: { active: DashboardRouteKey }) {
  return (
    <div className="flex w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white p-2">
      {ROUTE_ORDER.map((key) => (
        <Button
          asChild
          key={key}
          size="sm"
          variant={active === key ? 'default' : 'secondary'}
          className="rounded-lg px-4"
        >
          <Link href={`/dashboard/${key}`}>{ROUTE_LABEL[key]}</Link>
        </Button>
      ))}
    </div>
  );
}
