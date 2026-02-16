import { useQuery } from '@tanstack/react-query';
import tradingSignalsService from '@/services/api/trading-signals';
import tradingSignalsKeys from './queryKeys';

export function useTradingSignalsQuery(options: {
  market?: 'CRYPTO' | 'KR' | 'US';
  minConfidence?: number;
  refetchInterval?: number | false;
} = {}) {
  const { market, minConfidence = 0.5, refetchInterval = 10_000 } = options;

  return useQuery({
    queryKey: tradingSignalsKeys.byMarket(market, minConfidence),
    queryFn: () => tradingSignalsService.getSignals({ market, minConfidence }),
    staleTime: 8_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
