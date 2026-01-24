import { Nullable } from './utils';

export type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

export type WorkerStatusRow = {
  service: string;
  state: WorkerState;
  run_mode: Nullable<string>;
  message: Nullable<string>;
  last_event_at: Nullable<string>; // timestamptz
  last_success_at: Nullable<string>; // timestamptz
  updated_at: Nullable<string>; // timestamptz
};

export type IngestionRunStatus = 'success' | 'running' | 'failed' | 'skipped';

export type IngestionRunRow = {
  id: number;
  job: string;
  symbols: Nullable<string[]>;
  timeframe: Nullable<string>;
  status: IngestionRunStatus;
  inserted_count: Nullable<number>;
  error_message: Nullable<string>;
  started_at: string; // timestamptz
  finished_at: string; // timestamptz
};

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type AiResultRow = {
  id: number;
  market: string; // 'KR' | 'US' | 'CRYPTO'
  mode: string;
  symbol: string;
  decision: string;
  confidence: number;
  summary: string;
  reasons: unknown; // jsonb
  raw_response: unknown; // jsonb
  risk_level: RiskLevel;
  created_at: string; // timestamptz
};
