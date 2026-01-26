import Services from '../client';
import type { OpsSnapshot } from '@/types/api/snapshot';

class SnapshotService extends Services {
  /**
   * @description 스냅샷 조회
   */
  getSnapshot(): Promise<OpsSnapshot> {
    return this.get<OpsSnapshot>('/');
  }

  /**
   * @description 강제 스냅샷 조회
   */
  getForceSnapshot(): Promise<OpsSnapshot> {
    return this.get<OpsSnapshot>('/', { force: 1 });
  }
}

// 인스턴스 생성 및 export
const snapshotService = new SnapshotService({
  baseURL: '/api/snapshot',
});

export default snapshotService;
