import Services from '../client';
import type { OpsSnapshot } from '@/types/api/snapshot';

class SnapshotService extends Services {
  getSnapshot(force = false): Promise<OpsSnapshot> {
    return this.get<OpsSnapshot>('/', force ? { force: 1 } : undefined);
  }
}

const snapshotService = new SnapshotService({
  baseURL: '/api/snapshot',
});

export default snapshotService;
