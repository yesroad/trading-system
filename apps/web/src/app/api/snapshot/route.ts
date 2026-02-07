import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env.server';
import type {
  AiResultRow,
  AnalysisRunRow,
  IngestionRunRow,
  OpsSnapshot,
  PositionRow,
  WorkerStatusRow,
} from '@/types/api/snapshot';

export const runtime = 'nodejs';

/**
 * ✅ 서버 전용 ENV
 * - NEXT_PUBLIC_* 쓰면 클라이언트로 노출될 수 있어서 금지
 */
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    const SUPABASE_URL = envServer('SUPABASE_URL');
    const SUPABASE_KEY = envServer('SUPABASE_KEY');
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });
  }

  return supabase;
}

type CacheEntry<T> = {
  expiresAt: number;
  generatedAt: string;
  value: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

function nowIso(): string {
  return DateTime.utc().toISO() ?? DateTime.utc().toFormat("yyyy-LL-dd'T'HH:mm:ss.SSS'Z'");
}

function lagMinutesFromIso(iso: string | null): number | null {
  if (!iso) return null;
  const dt = DateTime.fromISO(iso, { zone: 'utc' });
  if (!dt.isValid) return null;
  const diffMinutes = DateTime.utc().diff(dt, 'minutes').minutes;
  return Math.max(0, Math.floor(diffMinutes));
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

const SELECT_WORKER_STATUS = [
  'service',
  'run_mode',
  'state',
  'message',
  'last_event_at',
  'last_success_at',
  'updated_at',
].join(', ');
const SELECT_INGESTION_RUNS = [
  'id',
  'job',
  'symbols',
  'timeframe',
  'status',
  'inserted_count',
  'updated_count',
  'error_message',
  'started_at',
  'finished_at',
].join(', ');
const SELECT_ANALYSIS_RUNS = [
  'id',
  'service',
  'market',
  'symbol',
  'input_hash',
  'status',
  'skip_reason',
  'error_message',
  'latency_ms',
  'model',
  'prompt_tokens',
  'completion_tokens',
  'total_tokens',
  'window_start',
  'window_end',
  'created_at',
].join(', ');
const SELECT_AI_RESULTS = [
  'id',
  'market',
  'mode',
  'symbol',
  'decision',
  'confidence',
  'summary',
  'reasons',
  'raw_response',
  'risk_level',
  'created_at',
].join(', ');
const SELECT_POSITIONS = ['market', 'symbol', 'qty'].join(', ');

async function withTtl<T>(params: {
  key: string;
  ttlMs: number;
  force: boolean;
  loader: () => Promise<T>;
}): Promise<{ generatedAt: string; value: T; cacheHit: boolean }> {
  const now = DateTime.utc().toMillis();
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
    const supabase = getSupabaseClient();
    const TTL_WORKER_MS = 3_000;
    const TTL_RUNS_MS = 10_000;

    const workerStatus = await withTtl<WorkerStatusRow[]>({
      key: 'workerStatus',
      ttlMs: TTL_WORKER_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('worker_status')
          .select(SELECT_WORKER_STATUS)
          .order('service', { ascending: true })
          .returns<WorkerStatusRow[]>();

        if (error) throw new Error(`worker_status: ${error.message}`);
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
          .select(SELECT_INGESTION_RUNS)
          .order('started_at', { ascending: false })
          .limit(20)
          .returns<IngestionRunRow[]>();

        if (error) throw new Error(`ingestion_runs: ${error.message}`);
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
          .select(SELECT_ANALYSIS_RUNS)
          .order('created_at', { ascending: false })
          .limit(30)
          .returns<AnalysisRunRow[]>();

        if (error) throw new Error(`analysis_runs: ${error.message}`);
        return data ?? [];
      },
    });

    // ✅ ai_analysis_results: “targets별 N건 저장” 스키마에 맞춤
    const aiResults = await withTtl<AiResultRow[]>({
      key: 'aiResults',
      ttlMs: TTL_RUNS_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('ai_analysis_results')
          .select(SELECT_AI_RESULTS)
          .order('created_at', { ascending: false })
          .limit(50)
          .returns<AiResultRow[]>();

        if (error) throw new Error(`ai_analysis_results: ${error.message}`);
        return data ?? [];
      },
    });

    const positions = await withTtl<PositionRow[]>({
      key: 'positions',
      ttlMs: TTL_RUNS_MS,
      force,
      loader: async () => {
        const { data, error } = await supabase
          .from('positions')
          .select(SELECT_POSITIONS)
          .gt('qty', 0)
          .returns<PositionRow[]>();

        if (error) throw new Error(`positions: ${error.message}`);
        return data ?? [];
      },
    });

    const allHit =
      workerStatus.cacheHit &&
      ingestionRuns.cacheHit &&
      analysisRuns.cacheHit &&
      aiResults.cacheHit &&
      positions.cacheHit;

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
        positions: {
          generatedAt: positions.generatedAt,
          ttlSeconds: TTL_RUNS_MS / 1000,
          cacheHit: positions.cacheHit,
          data: positions.value,
        },
      },
    };

    return NextResponse.json(body, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, generatedAt: nowIso() }, { status: 500 });
  }
}
