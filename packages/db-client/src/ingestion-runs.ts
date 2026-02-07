import { getSupabase } from './client';

export type IngestionStatus = 'success' | 'running' | 'failed' | 'skipped';

export interface IngestionRunInsert {
  job: string;
  symbols: string[];
  timeframe: string;
  status: IngestionStatus;
  inserted_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}

/**
 * ingestion_runs 테이블에 실행 기록 삽입
 */
export async function insertIngestionRun(params: IngestionRunInsert): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('ingestion_runs').insert({
    job: params.job,
    symbols: params.symbols,
    timeframe: params.timeframe,
    status: params.status,
    inserted_count: params.inserted_count,
    error_message: params.error_message,
    started_at: params.started_at,
    finished_at: params.finished_at,
  });

  if (error) {
    throw new Error(`ingestion_runs 저장 실패: ${error.message}`);
  }
}
