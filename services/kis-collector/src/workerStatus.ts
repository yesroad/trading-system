/**
 * worker_status 업데이트 유틸
 */

import { supabase } from './supabase.js';
import type { Nullable } from './types/utils.js';

export type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

const SERVICE_NAME = 'kis-collector' as const;

export async function upsertWorkerStatus(params: {
  run_mode: string;
  state: WorkerState;
  message?: Nullable<string>;
  last_event_at?: string;
  last_success_at?: Nullable<string>;
}) {
  const nowIso = new Date().toISOString();

  const { error } = await supabase.from('worker_status').upsert(
    {
      service: SERVICE_NAME,
      run_mode: params.run_mode,
      state: params.state,
      message: params.message ?? null,
      last_event_at: params.last_event_at ?? nowIso,
      last_success_at: params.last_success_at ?? null,
      updated_at: nowIso,
    },
    { onConflict: 'service' },
  );

  if (error) {
    console.error('[kis-collector] worker_status 업데이트 실패', error);
  }
}
