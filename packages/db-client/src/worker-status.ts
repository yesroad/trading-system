import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';

export type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

export type WorkerStatusUpsert = {
  service: string;
  state: WorkerState;
  run_mode?: string | null;
  message?: string | null;
  last_event_at?: string | null;
  last_success_at?: string | null;
  updated_at?: string | null;
};

export interface WorkerStatusRow {
  service: string;
  state: WorkerState;
  run_mode: string | null;
  message: string | null;
  last_event_at: string | null;
  last_success_at: string | null;
  updated_at: string;
}

/**
 * 워커 상태 업데이트 (upsert)
 */
export async function upsertWorkerStatus(patch: WorkerStatusUpsert): Promise<void> {
  const supabase = getSupabase();

  const payload: WorkerStatusUpsert = {
    ...patch,
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('worker_status').upsert(payload, { onConflict: 'service' });

  if (error) {
    throw new Error(`worker_status 저장 실패: ${error.message}`);
  }
}

/**
 * 워커 상태 조회
 */
export async function getWorkerStatus(serviceName: string): Promise<WorkerStatusRow | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('worker_status')
    .select('*')
    .eq('service', serviceName)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null;
    }
    throw new Error(`Failed to get worker status: ${error.message}`);
  }

  return data;
}
