import { supabase } from './supabase';

export async function fetchRecentIngestionRuns(limit: number) {
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select(
      'id,job,symbols,timeframe,started_at,finished_at,status,inserted_count,updated_count,error_message',
    )
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`ingestion_runs 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function fetchLatestAiResultsByMarket(markets: Array<'KR' | 'US' | 'CRYPTO'>) {
  // 시장별 최신 created_at 하나만 가져오기 위해 “group by + max” 대신
  // 간단히 RPC나 view 없이도 동작하는 방식으로: markets를 돌면서 1개씩 가져옴 (시장 3개면 충분히 가벼움)
  const out: Array<{ market: string; latest_created_at: string | null }> = [];

  for (const m of markets) {
    const { data, error } = await supabase
      .from('ai_analysis_results')
      .select('created_at')
      .eq('market', m)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`ai_analysis_results 조회 실패(${m}): ${error.message}`);

    out.push({
      market: m,
      latest_created_at:
        Array.isArray(data) && data[0]?.created_at ? String(data[0].created_at) : null,
    });
  }

  return out;
}

export async function fetchLatestWorkers() {
  const { data, error } = await supabase
    .from('worker_status')
    .select('service,state,run_mode,last_event_at,last_success_at,message')
    .order('service', { ascending: true });

  if (error) throw new Error(`worker_status 조회 실패: ${error.message}`);
  return data ?? [];
}

export async function fetchLatestIngestionSuccessByJobs(jobs: string[]) {
  const out: Array<{ job: string; latest_success_at: string | null }> = [];

  for (const job of jobs) {
    const { data, error } = await supabase
      .from('ingestion_runs')
      .select('started_at,status')
      .eq('job', job)
      .eq('status', 'success')
      .order('started_at', { ascending: false })
      .limit(1);

    if (error) throw new Error(`ingestion_runs latest success 조회 실패(${job}): ${error.message}`);

    out.push({
      job,
      latest_success_at:
        Array.isArray(data) && data[0]?.started_at ? String(data[0].started_at) : null,
    });
  }

  return out;
}
