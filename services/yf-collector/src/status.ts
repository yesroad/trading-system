/**
 * 워커 상태(모드/스킵/성공/실패)를 DB에 남기는 용도
 */

import { supabase } from './supabase.js';
import type { Nullable } from './types/utils.js';

export type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

export async function upsertWorkerStatus(params: {
  service: string; // 'yf-collector'
  run_mode: string; // MARKET_ONLY/EXTENDED/ALWAYS
  state: WorkerState;
  message?: Nullable<string>;
  last_event_at?: string; // ISO
  last_success_at?: Nullable<string>;
}) {
  const now = new Date().toISOString();

  const { error } = await supabase.from('worker_status').upsert(
    {
      service: params.service,
      run_mode: params.run_mode,
      state: params.state,
      message: params.message ?? null,
      last_event_at: params.last_event_at ?? now,
      last_success_at: params.last_success_at ?? null,
      updated_at: now,
    },
    { onConflict: 'service' },
  );

  if (error) throw error;
}
