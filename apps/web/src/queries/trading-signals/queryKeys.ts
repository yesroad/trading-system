const tradingSignalsKeys = {
  all: ['trading-signals'] as const,
  byMarket: (market?: 'CRYPTO' | 'KR' | 'US', minConfidence?: number) =>
    [...tradingSignalsKeys.all, { market, minConfidence }] as const,
};

export default tradingSignalsKeys;
