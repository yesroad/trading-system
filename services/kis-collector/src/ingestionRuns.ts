/**
 * ingestion_runs 테이블 관리
 */

import { supabase } from './db/supabase';
import { nowIso, type Nullable } from '@workspace/shared-utils';

type IngestionRunStatus = 'success' | 'running' | 'failed' | 'skipped';

type CreateIngestionRunParams = {
  job: string;
  symbols: string[];
  timeframe: string;
};

type UpdateIngestionRunParams = {
  status: IngestionRunStatus;
  inserted_count?: number;
  error_message?: Nullable<string>;
};

/**
 * 새 ingestion run 시작
 */
export async function createIngestionRun(params: CreateIngestionRunParams): Promise<number> {
  const now = nowIso();

  const { data, error } = await supabase
    .from('ingestion_runs')
    .insert({
      job: params.job,
      symbols: params.symbols,
      timeframe: params.timeframe,
      status: 'running',
      inserted_count: 0,
      error_message: null,
      started_at: now,
      finished_at: now,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[kis-collector] ingestion_runs 생성 실패', error);
    throw new Error(error.message);
  }

  return data.id;
}

/**
 * ingestion run 업데이트
 */
export async function updateIngestionRun(runId: number, params: UpdateIngestionRunParams) {
  const now = nowIso();

  const { error } = await supabase
    .from('ingestion_runs')
    .update({
      status: params.status,
      inserted_count: params.inserted_count ?? 0,
      error_message: params.error_message ?? null,
      finished_at: now,
    })
    .eq('id', runId);

  if (error) {
    console.error('[kis-collector] ingestion_runs 업데이트 실패', error);
    throw new Error(error.message);
  }
}

/**
 * ingestion run 종료 (성공)
 */
export async function finishIngestionRun(runId: number, insertedCount: number) {
  await updateIngestionRun(runId, {
    status: 'success',
    inserted_count: insertedCount,
    error_message: null,
  });
}

/**
 * ingestion run 종료 (실패)
 */
export async function failIngestionRun(runId: number, errorMessage: string) {
  await updateIngestionRun(runId, {
    status: 'failed',
    inserted_count: 0,
    error_message: errorMessage,
  });
}
