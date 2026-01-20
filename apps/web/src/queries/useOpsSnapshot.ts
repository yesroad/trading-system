import { useQuery } from '@tanstack/react-query';
import { fetchOpsSnapshot, fetchOpsSnapshotForce } from '@/services/api/ops.snapshot';

export function useOpsSnapshot() {
  return useQuery({
    queryKey: ['opsSnapshot'],
    queryFn: fetchOpsSnapshot,
    staleTime: 5_000,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
}

/** 버튼용(수동 트리거 전용) */
export function useOpsSnapshotForce() {
  return useQuery({
    queryKey: ['opsSnapshot', 'force'],
    queryFn: fetchOpsSnapshotForce,
    enabled: false,
    retry: 0,
  });
}
