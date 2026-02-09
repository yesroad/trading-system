import type { Nullable } from '@workspace/shared-utils';

export type MarketCode = 'CRYPTO' | 'KR' | 'US';
export type RiskLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';

export type SnapshotMeta = {
  generatedAtUtc: string;
  force: boolean;
  ttlSeconds: number;
  cacheHit: boolean;
};

export type MarketRiskCounts = {
  HIGH: number;
  MEDIUM: number;
  LOW: number;
};

export type MarketSummary = {
  market: MarketCode;
  status: 'ok' | 'warn' | 'down';
  latestIngestionAtUtc: Nullable<string>;
  latestAnalysisAtUtc: Nullable<string>;
  ingestionLagMinutes: Nullable<number>;
  analysisLagMinutes: Nullable<number>;
  riskCounts: MarketRiskCounts;
};

export type SnapshotItem = {
  id: number;
  symbol: string;
  riskLevel: RiskLevel;
  confidence: string;
  summary: string;
  reasons: string[];
  decision: 'ALLOW' | 'CAUTION' | 'BLOCK' | 'UNKNOWN';
  createdAtUtc: string;
  isHolding: boolean;
};

export type MarketDetail = {
  market: MarketCode;
  targetCount: number;
  latestIngestionAtUtc: Nullable<string>;
  latestAnalysisAtUtc: Nullable<string>;
  ingestionLagMinutes: Nullable<number>;
  analysisLagMinutes: Nullable<number>;
  riskCounts: MarketRiskCounts;
  items: SnapshotItem[];
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
  markets: Record<MarketCode, MarketSummary>;
  tabs: Record<MarketCode, MarketDetail>;
  holdingsByMarket: Record<MarketCode, string[]>;
  performance: SnapshotPerformance;
};
