import { supabase } from './supabase';
import type { UpbitMinuteCandle } from '../types/upbit';

function nowIso(): string {
  return new Date().toISOString();
}

// Upbit의 candle_date_time_utc는 보통 타임존 표시(Z)가 없는 형태라서,
// DB(timestamptz) 저장/변환 시 UTC로 명확히 해준다.
function normalizeUtcIso(utcLike: string): string {
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

// UTC ISO → KST 로컬 시각 문자열(YYYY-MM-DD HH:mm:ss)
function utcIsoToKstLocalTimestamp(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`시간 파싱 실패(UTC): ${utcIso}`);
  }

  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  });
}

export async function upsertUpbitCandles(rows: UpbitMinuteCandle[]): Promise<number> {
  if (rows.length === 0) return 0;

  const payload = rows.map((c) => {
    const candleTimeUtc = normalizeUtcIso(c.candle_date_time_utc);
    const candleTimeKst = utcIsoToKstLocalTimestamp(candleTimeUtc);

    return {
      market: c.market,
      timeframe: `${c.unit}m`,
      candle_time_kst: candleTimeKst,
      candle_time_utc: candleTimeUtc,
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
      trade_price: c.candle_acc_trade_price,
      source_timestamp: c.timestamp,
      created_at: nowIso(),
    };
  });

  const { error, data } = await supabase
    .from('upbit_candles')
    .upsert(payload, { onConflict: 'market,timeframe,candle_time_utc' })
    .select('market');

  if (error) throw new Error(`upbit_candles 저장 실패: ${error.message}`);

  return Array.isArray(data) ? data.length : rows.length;
}

type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

type WorkerStatusUpsert = {
  service: string;
  state: WorkerState;
  run_mode?: string | null;
  message?: string | null;
  last_event_at?: string | null;
  last_success_at?: string | null;
  updated_at?: string | null;
};

export async function upsertWorkerStatus(patch: WorkerStatusUpsert): Promise<void> {
  const payload: WorkerStatusUpsert = {
    ...patch,
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('worker_status').upsert(payload, { onConflict: 'service' });
  if (error) throw new Error(`worker_status 저장 실패: ${error.message}`);
}

export async function insertIngestionRun(params: {
  job: string;
  symbols: string[];
  timeframe: string;
  status: 'success' | 'running' | 'failed' | 'skipped';
  inserted_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}): Promise<void> {
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
  if (error) throw new Error(`ingestion_runs 저장 실패: ${error.message}`);
}
