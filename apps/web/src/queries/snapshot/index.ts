import { useQuery } from '@tanstack/react-query';
import snapshotKeys from './queryKeys';
import snapshotService from '@/services/api/snapshot';

type GetSnapshotOptions = {
  enabled?: boolean;
  refetchInterval?: number | false;
  refetchIntervalInBackground?: boolean;
  retry?: number;
  staleTime?: number;
};

export function useGetSnapshot(options: GetSnapshotOptions = {}) {
  return useQuery({
    queryKey: snapshotKeys.getSnapshot,
    queryFn: () => snapshotService.getSnapshot(),
    staleTime: options.staleTime ?? 5_000,
    refetchInterval: options.refetchInterval ?? 10_000,
    refetchIntervalInBackground: options.refetchIntervalInBackground ?? false,
    enabled: options.enabled ?? true,
    retry: options.retry ?? 1,
  });
}

/** 버튼용(수동 트리거 전용) */
export function useGetSnapshotForce() {
  return useQuery({
    queryKey: snapshotKeys.getSnapshotForce,
    queryFn: () => snapshotService.getForceSnapshot(),
    enabled: false,
    retry: 0,
  });
}
