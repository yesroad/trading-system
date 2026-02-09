import { useQuery } from '@tanstack/react-query';
import snapshotService from '@/services/api/snapshot';
import snapshotKeys from './queryKeys';

type UseSnapshotOptions = {
  force?: boolean;
  refetchInterval?: number | false;
};

export function useSnapshotQuery(options: UseSnapshotOptions = {}) {
  const force = options.force ?? false;

  return useQuery({
    queryKey: snapshotKeys.byForce(force),
    queryFn: () => snapshotService.getSnapshot(force),
    staleTime: force ? 0 : 5_000,
    refetchInterval: options.refetchInterval ?? 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}
