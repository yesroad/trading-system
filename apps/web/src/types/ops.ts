import { Nullable } from './utils';

export type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

export type WorkerStatusRow = {
  service: string;
  run_mode: Nullable<string>;
  state: WorkerState;
  message: Nullable<string>;
  last_event_at: Nullable<string>;
  last_success_at: Nullable<string>;
  updated_at: Nullable<string>;
};

export type IngestionRunRow = {
  id: number;
  job: string;
  symbols: Nullable<string[]>;
  timeframe: Nullable<string>;
  status: string;
  inserted_count: Nullable<number>;
  error_message: Nullable<string>;
  started_at: Nullable<string>;
  finished_at: Nullable<string>;
};

export type AnalysisRunRow = {
  id: number;
  service: string;
  market: string;
  symbol: string;
  status: string;
  skip_reason: Nullable<string>;
  error_message: Nullable<string>;
  latency_ms: Nullable<number>;
  model: Nullable<string>;
  total_tokens: Nullable<number>;
  window_start: Nullable<string>;
  window_end: Nullable<string>;
  created_at: Nullable<string>;
};

export type AiResultRow = {
  id: number;
  market: string;
  symbol: string;
  timeframe: string;
  decision: string;
  confidence: Nullable<number>;
  reason: Nullable<string>;
  window_end: Nullable<string>;
  created_at: Nullable<string>;
};

export type SnapshotBlock<T> = {
  generatedAt: string;
  ttlSeconds?: number;
  cacheHit?: boolean;
  data: T;
};

export type OpsSnapshot = {
  meta: {
    generatedAt: string;
    force?: boolean;
    ttlSeconds?: number;
    cacheHit?: boolean;
    lagMinutesMax?: Nullable<number>;
    lagByService?: Record<string, Nullable<number>>;
  };
  blocks: {
    workerStatus: SnapshotBlock<WorkerStatusRow[]>;
    ingestionRuns: SnapshotBlock<IngestionRunRow[]>;
    analysisRuns: SnapshotBlock<AnalysisRunRow[]>;
    aiResults: SnapshotBlock<AiResultRow[]>;
  };
};
