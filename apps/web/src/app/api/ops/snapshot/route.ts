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

function lagMinutesFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  // 미래 시각이 들어오면 0으로 클램프
  return Math.max(0, Math.floor(diffMs / 60_000));
}

function buildLagByService(rows: WorkerStatusRow[]) {
  const lagByService: Record<string, number | null> = {};
  const lags: number[] = [];

  for (const r of rows) {
    const lag = lagMinutesFromIso(r.last_success_at);
    lagByService[r.service] = lag;
    if (typeof lag === 'number') lags.push(lag);
  }

  const lagMinutesMax = lags.length === 0 ? null : Math.max(...lags);
  return { lagByService, lagMinutesMax };
}

async function withTtl<T>(params: {
  key: string;
  ttlMs: number;
  force: boolean;
  loader: () => Promise<T>;
}): Promise<{ generatedAt: string; value: T; cacheHit: boolean }> {
  const now = Date.now();
  const hit = cache.get(params.key) as CacheEntry<T> | undefined;

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
        return (data ?? []) as WorkerStatusRow[];
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
        return (data ?? []) as IngestionRunRow[];
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
        return (data ?? []) as AnalysisRunRow[];
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
        return (data ?? []) as AiResultRow[];
      },
    });

    const allHit =
      workerStatus.cacheHit &&
      ingestionRuns.cacheHit &&
      analysisRuns.cacheHit &&
      aiResults.cacheHit;

    // ✅ 1번: 서버에서 “지연(분)” 계산
    const { lagByService, lagMinutesMax } = buildLagByService(workerStatus.value);

    const body: OpsSnapshot = {
      meta: {
        generatedAt: nowIso(),
        force,
        ttlSeconds: TTL_RUNS_MS / 1000,
        cacheHit: allHit,

        lagMinutesMax,
        lagByService,
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
