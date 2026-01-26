export type MarketKey = 'CRYPTO' | 'US' | 'KR';
export type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'HOLDING';

export type MarketMeta = {
  label: string;
  targetCount: number;
  ingestionJob: string;
  route: string;
};

export const MARKET_META: Record<MarketKey, MarketMeta> = {
  CRYPTO: {
    label: '코인',
    targetCount: 30,
    ingestionJob: 'upbit-candle',
    route: '/dashboard/crypto',
  },
  US: {
    label: '미장',
    targetCount: 15,
    ingestionJob: 'yfinance-equity',
    route: '/dashboard/us',
  },
  KR: {
    label: '국장',
    targetCount: 15,
    ingestionJob: 'kis-equity',
    route: '/dashboard/kr',
  },
};

export const TAB_ORDER: MarketKey[] = ['CRYPTO', 'US', 'KR'];

export const FILTERS: { value: RiskFilter; label: string }[] = [
  { value: 'ALL', label: '전체' },
  { value: 'HIGH', label: 'HIGH' },
  { value: 'MEDIUM', label: 'MEDIUM' },
  { value: 'LOW', label: 'LOW' },
  { value: 'HOLDING', label: '보유만' },
];
