import { http } from './http';
import type { OpsSnapshot } from '@/types/ops';

export async function fetchOpsSnapshot(): Promise<OpsSnapshot> {
  const res = await http.get<OpsSnapshot>('/api/ops/snapshot');
  return res.data;
}

/** 버튼용: 캐시 무시 강제 생성 */
export async function fetchOpsSnapshotForce(): Promise<OpsSnapshot> {
  const res = await http.get<OpsSnapshot>('/api/ops/snapshot?force=1');
  return res.data;
}
