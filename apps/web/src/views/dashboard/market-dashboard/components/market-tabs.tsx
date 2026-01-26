import { usePathname, useRouter } from 'next/navigation';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MARKET_META, TAB_ORDER, type MarketKey } from '../constants';

export default function MarketTabs({ activeMarket }: { activeMarket: MarketKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = TAB_ORDER.find((key) => pathname?.startsWith(MARKET_META[key].route));
  const value = current ?? activeMarket;

  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        const target = MARKET_META[next as MarketKey];
        if (target) router.push(target.route);
      }}
      className="w-auto"
    >
      <TabsList className="w-auto justify-start">
        {TAB_ORDER.map((key) => (
          <TabsTrigger key={key} value={key} className="min-w-[88px]">
            {MARKET_META[key].label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
