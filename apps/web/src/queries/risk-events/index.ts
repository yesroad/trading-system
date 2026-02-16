import { useQuery } from '@tanstack/react-query';
import riskEventsService from '@/services/api/risk-events';
import riskEventsKeys from './queryKeys';

export function useRiskEventsQuery(options: {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  hours?: number;
  refetchInterval?: number | false;
} = {}) {
  const { severity, hours = 24, refetchInterval = 15_000 } = options;

  return useQuery({
    queryKey: riskEventsKeys.bySeverity(severity, hours),
    queryFn: () => riskEventsService.getEvents({ severity, hours }),
    staleTime: 12_000,
    refetchInterval,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
