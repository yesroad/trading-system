import type { MarketCode, PerformancePeriod } from '@/types/api/snapshot';

export type DashboardRouteKey = 'crypto' | 'kia' | 'yf';

export type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'HOLDING';

export const ROUTE_ORDER: DashboardRouteKey[] = ['crypto', 'kia', 'yf'];

export const ROUTE_TO_MARKET: Record<DashboardRouteKey, MarketCode> = {
  crypto: 'CRYPTO',
  kia: 'KR',
  yf: 'US',
};

export const MARKET_TO_ROUTE: Record<MarketCode, DashboardRouteKey> = {
  CRYPTO: 'crypto',
  KR: 'kia',
  US: 'yf',
};

export const ROUTE_LABEL: Record<DashboardRouteKey, string> = {
  crypto: 'CRYPTO',
  kia: 'KIA',
  yf: 'YF',
};

export const PERFORMANCE_PERIODS: PerformancePeriod[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'ALL'];
