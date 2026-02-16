const tradeHistoryKeys = {
  all: ['trade-history'] as const,
  byFilters: (market?: 'CRYPTO' | 'KR' | 'US', broker?: 'KIS' | 'UPBIT') =>
    [...tradeHistoryKeys.all, { market, broker }] as const,
};

export default tradeHistoryKeys;
