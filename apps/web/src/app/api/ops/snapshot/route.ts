import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env.server';
import type {
  OpsSnapshot,
  WorkerStatusRow,
  IngestionRunRow,
  AnalysisRunRow,
  AiResultRow,
} from '@/types/ops';

export const runtime = 'nodejs';

// ✅ 서버 전용 env 권장: NEXT_PUBLIC_* 말고 별도 키로
// (지금 envServer가 NEXT_PUBLIC만 받도록 되어있다면 일단 유지하고,
//  나중에 envServer를 서버 전용 키로 옮기는 걸 추천)
const SUPABASE_URL = envServer('NEXT_PUBLIC_SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = envServer('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type CacheEntry<T> = {
  expiresAt: number;
  generatedAt: string;
  value: T;
};

const cache = new Map<string, CacheEntry<any>>();

function nowIso() {
  return new Date().toISOString();
}

async function withTtl<T>(params: {
  key: string;
  ttlMs: number;
  force: boolean;
  loader: () => Promise<T>;
}): Promise<{ generatedAt: string; value: T; cacheHit: boolean }> {
  const now = Date.now();
  const hit = cache.get(params.key) as CacheEntry<T> | undefined;

  // ✅ force면 캐시를 무시하고 무조건 새로 로딩
  if (!params.force && hit && hit.expiresAt > now) {
    return { generatedAt: hit.generatedAt, value: hit.value, cacheHit: true };
  }

  const value = await params.loader();
  const generatedAt = nowIso();
  cache.set(params.key, { expiresAt: now + params.ttlMs, generatedAt, value });

  return { generatedAt, value, cacheHit: false };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';

  try {
    // 블록별 TTL (ms)
    const TTL_WORKER_MS = 3_000;
    const TTL_RUNS_MS = 10_000;

    const workerStatus = await withTtl<WorkerStatusRow[]>({
      key: 'workerStatus',
      ttlMs: TTL_WORKER_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('worker_status')
          .select('service, run_mode, state, message, last_event_at, last_success_at, updated_at')
          .order('service', { ascending: true });
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    });

    const ingestionRuns = await withTtl<IngestionRunRow[]>({
      key: 'ingestionRuns',
      ttlMs: TTL_RUNS_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('ingestion_runs')
          .select(
            'id, job, symbols, timeframe, status, inserted_count, error_message, started_at, finished_at',
          )
          .order('started_at', { ascending: false })
          .limit(20);
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    });

    const analysisRuns = await withTtl<AnalysisRunRow[]>({
      key: 'analysisRuns',
      ttlMs: TTL_RUNS_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('analysis_runs')
          .select(
            'id, service, market, symbol, status, skip_reason, error_message, latency_ms, model, total_tokens, window_start, window_end, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(30);
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    });

    const aiResults = await withTtl<AiResultRow[]>({
      key: 'aiResults',
      ttlMs: TTL_RUNS_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('ai_analysis_results')
          .select(
            'id, market, symbol, timeframe, decision, confidence, reason, window_end, created_at',
          )
          .order('created_at', { ascending: false })
          .limit(20);
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    });

    // ✅ 전체 cacheHit: 모든 블록이 hit일 때만 true
    const allHit =
      workerStatus.cacheHit &&
      ingestionRuns.cacheHit &&
      analysisRuns.cacheHit &&
      aiResults.cacheHit;

    const body: OpsSnapshot = {
      meta: {
        generatedAt: nowIso(),
        force,
        // “대시보드가 이해하기 쉬운” 표현: runs 기준 TTL을 대표로
        ttlSeconds: TTL_RUNS_MS / 1000,
        cacheHit: allHit,
      },
      blocks: {
        workerStatus: {
          generatedAt: workerStatus.generatedAt,
          ttlSeconds: TTL_WORKER_MS / 1000,
          cacheHit: workerStatus.cacheHit,
          data: workerStatus.value,
        },
        ingestionRuns: {
          generatedAt: ingestionRuns.generatedAt,
          ttlSeconds: TTL_RUNS_MS / 1000,
          cacheHit: ingestionRuns.cacheHit,
          data: ingestionRuns.value,
        },
        analysisRuns: {
          generatedAt: analysisRuns.generatedAt,
          ttlSeconds: TTL_RUNS_MS / 1000,
          cacheHit: analysisRuns.cacheHit,
          data: analysisRuns.value,
        },
        aiResults: {
          generatedAt: aiResults.generatedAt,
          ttlSeconds: TTL_RUNS_MS / 1000,
          cacheHit: aiResults.cacheHit,
          data: aiResults.value,
        },
      },
    };

    return NextResponse.json(body, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e), generatedAt: nowIso() },
      { status: 500 },
    );
  }
}
