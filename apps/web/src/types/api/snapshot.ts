import type { Nullable } from '../utils';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface WorkerStatusRow {
  service: string;
  run_mode: string;
  state: string;
  message: Nullable<string>;
  last_event_at: Nullable<string>;
  last_success_at: Nullable<string>;
  updated_at: string;
}

export interface IngestionRunRow {
  id: number;
  job: string;
  symbols: string[];
  timeframe: string;
  status: string;
  inserted_count: number;
  updated_count: number;
  error_message: Nullable<string>;
  started_at: string;
  finished_at: Nullable<string>;
}

export interface AnalysisRunRow {
  id: number;
  service: string;
  market: string;
  symbol: string;
  input_hash: string;
  status: string;
  skip_reason: Nullable<string>;
  error_message: Nullable<string>;
  latency_ms: Nullable<number>;
  model: Nullable<string>;
  prompt_tokens: Nullable<number>;
  completion_tokens: Nullable<number>;
  total_tokens: Nullable<number>;
  window_start: string;
  window_end: string;
  created_at: string;
}

export interface AiResultRow {
  id: number;
  market: string;
  mode: string;
  symbol: string;
  decision: string;
  confidence: number;
  summary: string;
  reasons: JsonValue;
  raw_response: JsonValue;
  risk_level: string;
  created_at: string;
}

export interface PositionRow {
  market: string;
  symbol: string;
  qty: number;
}

export interface OpsSnapshotMeta {
  generatedAt: string;
  force: boolean;
  ttlSeconds: number;
  cacheHit: boolean;
  lagMinutesMax: Nullable<number>;
  lagByService: Record<string, Nullable<number>>;
}

export interface OpsSnapshotBlock<T> {
  generatedAt: string;
  ttlSeconds: number;
  cacheHit: boolean;
  data: T;
}

export interface OpsSnapshot {
  meta: OpsSnapshotMeta;
  blocks: {
    workerStatus: OpsSnapshotBlock<WorkerStatusRow[]>;
    ingestionRuns: OpsSnapshotBlock<IngestionRunRow[]>;
    analysisRuns: OpsSnapshotBlock<AnalysisRunRow[]>;
    aiResults: OpsSnapshotBlock<AiResultRow[]>;
    positions: OpsSnapshotBlock<PositionRow[]>;
  };
}
