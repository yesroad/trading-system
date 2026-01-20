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

/**
 * 스냅샷의 각 블록(테이블)
 * - generatedAt: 이 블록이 만들어진 시각
 * - ttlSeconds/cacheHit: TTL 캐시 메타(있을 수도/없을 수도 있어서 optional)
 */
export type SnapshotBlock<T> = {
  generatedAt: string; // 이 블록이 만들어진 시각(캐시든 아니든)
  ttlSeconds?: number; // 이 블록 TTL(초)
  cacheHit?: boolean; // 이 블록이 캐시에서 나온 값인지
  data: T;
};

/**
 * /api/ops/snapshot 응답 타입
 * - meta.force: force=1로 강제 갱신했는지
 * - meta.ttlSeconds/meta.cacheHit: 대표 TTL/캐시 상태(있을 수도/없을 수도)
 */
export type OpsSnapshot = {
  meta: {
    generatedAt: string; // 전체 응답 생성 시각
    force?: boolean; // force=1 사용 여부
    ttlSeconds?: number; // 대표 TTL(초) - runs 기준
    cacheHit?: boolean; // 전체 블록이 모두 캐시 히트인지
  };
  blocks: {
    workerStatus: SnapshotBlock<WorkerStatusRow[]>;
    ingestionRuns: SnapshotBlock<IngestionRunRow[]>;
    analysisRuns: SnapshotBlock<AnalysisRunRow[]>;
    aiResults: SnapshotBlock<AiResultRow[]>;
  };
};
