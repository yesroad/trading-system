import type { MarketKey } from './constants';
import OpsDashboardPage from './OpsDashboardPage';

type MarketDashboardProps = {
  market: MarketKey;
};

export default function MarketDashboard({ market }: MarketDashboardProps) {
  return <OpsDashboardPage market={market} />;
}
