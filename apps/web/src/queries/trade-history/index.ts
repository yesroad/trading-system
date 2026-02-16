import { useQuery } from '@tanstack/react-query';
import tradeHistoryService from '@/services/api/trade-history';
import tradeHistoryKeys from './queryKeys';

export function useTradeHistoryQuery(options: {
  market?: 'CRYPTO' | 'KR' | 'US';
  broker?: 'KIS' | 'UPBIT';
  refetchInterval?: number | false;
} = {}) {
  const { market, broker, refetchInterval = 20_000 } = options;

  return useQuery({
    queryKey: tradeHistoryKeys.byFilters(market, broker),
    queryFn: () => tradeHistoryService.getTrades({ market, broker }),
    staleTime: 15_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
