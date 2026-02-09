import type { Nullable } from '@workspace/shared-utils';

export type MarketCode = 'CRYPTO' | 'KR' | 'US';

export type SnapshotMeta = {
  generatedAtUtc: string;
  force: boolean;
  ttlSeconds: number;
  cacheHit: boolean;
};

export type PortfolioMoney = {
  asset: string;
  invested: string;
  cash: string;
  realizedPnl: string;
  unrealizedPnl: string;
  pnl: string;
  pnlRatePct: Nullable<string>;
};

export type MarketPortfolioSummary = PortfolioMoney & {
  market: MarketCode;
  weightPct: string;
  positionCount: number;
};

export type SnapshotPosition = {
  id: string;
  broker: string;
  market: MarketCode;
  symbol: string;
  qty: string;
  avgPrice: Nullable<string>;
  currentPrice: Nullable<string>;
  invested: string;
  marketValue: Nullable<string>;
  realizedPnl: string;
  unrealizedPnl: Nullable<string>;
  pnl: Nullable<string>;
  pnlRatePct: Nullable<string>;
  updatedAtUtc: Nullable<string>;
  priceUpdatedAtUtc: Nullable<string>;
};

export type PerformancePeriod = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'ALL';

export type PerformanceMetrics = {
  totalTrades: number;
  winTrades: number;
  lossTrades: number;
  pnlAmount: Nullable<string>;
  pnlRatePct: Nullable<string>;
};

export type SnapshotPerformance = Record<PerformancePeriod, PerformanceMetrics>;

export type OpsSnapshot = {
  meta: SnapshotMeta;
  updatedAt: string;
  total: PortfolioMoney & {
    positionCount: number;
  };
  byMarket: Record<MarketCode, MarketPortfolioSummary>;
  positions: SnapshotPosition[];
  performance: SnapshotPerformance;
};
