import { supabase } from '../supabase.js';
import { Market } from '../config/markets.js';
import type { WorkerStatusRow, IngestionRunRow, AiResultRow } from '../types/db.js';
import { nowIso } from '@workspace/shared-utils';

export type Snapshot = {
  generatedAt: string; // ISO
  market: Market;
  services: {
    required: string[]; // 이 시장에서 봐야 하는 워커 목록
    workers: WorkerStatusRow[];
  };
  ingestion: {
    jobs: string[]; // 이 시장에서 봐야 하는 ingestion job 목록
    recentRuns: IngestionRunRow[];
  };
  ai: {
    recentResults: AiResultRow[];
    latestCreatedAt: string | null; // 가장 최근 AI 실행 시각 (ISO)
    latestSymbols: string[]; // 가장 최근 AI 실행 시 분석한 종목들
  };
};

function uniqueStrings(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

/**
 * 시장별로 “어떤 서비스/잡을 봐야 하는지”를 여기서 고정
 */
function getMarketDeps(market: Market): { services: string[]; jobs: string[] } {
  if (market === Market.KRX) {
    return {
      services: ['kis-collector', 'ai-analyzer', 'trade-executor'],
      jobs: ['kis-equity'],
    };
  }

  if (market === Market.US) {
    return {
      services: ['yf-collector', 'ai-analyzer', 'trade-executor'],
      jobs: ['yfinance-equity'],
    };
  }

  return {
    services: ['upbit-collector', 'ai-analyzer', 'trade-executor'],
    jobs: ['upbit-candle'],
  };
}

async function fetchWorkersByServices(services: string[]): Promise<WorkerStatusRow[]> {
  if (services.length === 0) return [];

  const { data, error } = await supabase
    .from('worker_status')
    .select('service,state,run_mode,message,last_event_at,last_success_at,updated_at')
    .in('service', services);

  if (error) throw new Error(`worker_status 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) return [];

  return data as WorkerStatusRow[];
}

async function fetchRecentIngestionRuns(jobs: string[], limit: number): Promise<IngestionRunRow[]> {
  if (jobs.length === 0) return [];

  // ✅ created_at 컬럼이 실제 테이블에 없으므로 select에서 제거
  const { data, error } = await supabase
    .from('ingestion_runs')
    .select('id,job,symbols,timeframe,status,inserted_count,error_message,started_at,finished_at')
    .in('job', jobs)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`ingestion_runs 조회 실패: ${error.message}`);
  if (!Array.isArray(data)) return [];

  return data as IngestionRunRow[];
}

async function fetchRecentAiResults(market: Market, limit: number): Promise<AiResultRow[]> {
  const marketKey = String(market);

  // ✅ ai_analysis_results는 네가 만든 새 스키마 기준으로만 조회
  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select(
      'id,market,mode,symbol,decision,confidence,summary,reasons,raw_response,risk_level,created_at',
    )
    .eq('market', marketKey)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.log(`[AI] ai_analysis_results 조회 스킵: ${error.message}`);
    return [];
  }

  if (!Array.isArray(data)) return [];
  return data as AiResultRow[];
}

/**
 * AI 결과에서 가장 최근 실행 시각과 해당 시점의 종목들 추출
 */
function extractLatestAiInfo(results: AiResultRow[]): {
  latestCreatedAt: string | null;
  latestSymbols: string[];
} {
  if (results.length === 0) {
    return { latestCreatedAt: null, latestSymbols: [] };
  }

  // 가장 최근 created_at 찾기 (이미 created_at desc로 정렬되어 있음)
  const latest = results[0];
  const latestTime = latest.created_at;

  // 같은 시각에 생성된 모든 결과의 심볼 수집
  const latestSymbols = results
    .filter((r) => r.created_at === latestTime)
    .map((r) => r.symbol)
    .filter(Boolean);

  return {
    latestCreatedAt: latestTime,
    latestSymbols: uniqueStrings(latestSymbols),
  };
}

/**
 * ✅ collectSnapshot
 */
export async function collectSnapshot(market: Market): Promise<Snapshot> {
  const generatedAt = nowIso();
  const deps = getMarketDeps(market);

  const services = uniqueStrings(deps.services);
  const jobs = uniqueStrings(deps.jobs);

  const [workers, recentRuns, recentAi] = await Promise.all([
    fetchWorkersByServices(services),
    fetchRecentIngestionRuns(jobs, 50),
    fetchRecentAiResults(market, 30),
  ]);

  const { latestCreatedAt, latestSymbols } = extractLatestAiInfo(recentAi);

  console.log(
    `[AI] 스냅샷 수집 완료 | market=${market} | workers=${workers.length} | runs=${recentRuns.length} | ai=${recentAi.length} | latestAt=${latestCreatedAt}`,
  );

  return {
    generatedAt,
    market,
    services: {
      required: services,
      workers,
    },
    ingestion: {
      jobs,
      recentRuns,
    },
    ai: {
      recentResults: recentAi,
      latestCreatedAt,
      latestSymbols,
    },
  };
}
