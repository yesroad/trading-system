# @workspace/db-client

Supabase (PostgreSQL) 데이터베이스 접근 레이어입니다.

## 개요

이 패키지는 trading-system의 모든 서비스가 Supabase 데이터베이스에 접근할 때 사용하는 공통 인터페이스를 제공합니다. 자주 사용하는 쿼리는 함수로 제공하며, 그 외의 쿼리는 `getSupabase()` 싱글톤을 통해 직접 작성할 수 있습니다.

## 설치

```bash
# 다른 워크스페이스에서 사용
yarn workspace your-service add @workspace/db-client@*
```

## 환경변수

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-key
```

## 주요 모듈

### 1. 클라이언트 (`client.ts`)

#### `getSupabase(): SupabaseClient`
Supabase 싱글톤 인스턴스를 반환합니다.

```typescript
import { getSupabase } from '@workspace/db-client';

const supabase = getSupabase();

// 쿼리 실행
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('id', 123);

if (error) {
  throw new Error(`Query failed: ${error.message}`);
}
```

#### `resetSupabaseClient(): void`
테스트용 함수. 싱글톤 인스턴스를 초기화합니다.

```typescript
import { resetSupabaseClient } from '@workspace/db-client';

// 테스트 전 리셋
beforeEach(() => {
  resetSupabaseClient();
});
```

### 2. 포지션 (`positions.ts`)

#### `loadCryptoPositions(params): Promise<PositionRow[]>`
암호화폐 보유 자산을 조회합니다.

```typescript
import { loadCryptoPositions } from '@workspace/db-client';

const positions = await loadCryptoPositions({
  broker: 'UPBIT',
});

// 결과
// [
//   { broker: 'UPBIT', market: 'KRW', symbol: 'KRW-BTC', qty: 0.1, avg_price: 100000000, updated_at: '...' },
//   ...
// ]
```

**타입:**
```typescript
type PositionRow = {
  broker: string;
  market: string;
  symbol: string;
  qty: number;
  avg_price: number;
  updated_at: string;
};
```

### 3. 워커 상태 (`worker-status.ts`)

#### `upsertWorkerStatus(data): Promise<void>`
워커 실행 상태를 기록합니다.

```typescript
import { upsertWorkerStatus } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';

await upsertWorkerStatus({
  worker_id: 'upbit-collector',
  last_run_at: nowIso(),
  status: 'ok',
});
```

**파라미터:**
```typescript
type WorkerStatusData = {
  worker_id: string;
  last_run_at: string;
  status: 'ok' | 'error';
  error?: string;
  metadata?: Record<string, unknown>;
};
```

### 4. 계좌 현금 (`account-cash.ts`)

#### `upsertAccountCash(data): Promise<void>`
계좌의 사용 가능 현금을 기록합니다.

```typescript
import { upsertAccountCash } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';

await upsertAccountCash({
  broker: 'UPBIT',
  currency: 'KRW',
  available: 1000000,
  total: 1500000,
  updated_at: nowIso(),
});
```

**파라미터:**
```typescript
type AccountCashData = {
  broker: string;
  currency: 'KRW' | 'USD';
  available: number;
  total: number;
  updated_at: string;
};
```

### 5. 수집 배치 추적 (`ingestion-runs.ts`)

#### `insertIngestionRun(data): Promise<string>`
데이터 수집 배치를 시작하고 run ID를 반환합니다.

```typescript
import { insertIngestionRun, finishIngestionRun } from '@workspace/db-client';

// 배치 시작
const runId = await insertIngestionRun({
  source: 'upbit-collector',
  target_count: 50,
});

// ... 수집 작업 ...

// 배치 완료
await finishIngestionRun(runId, {
  success_count: 48,
  error_count: 2,
});
```

**타입:**
```typescript
type IngestionRunData = {
  source: string;
  target_count: number;
  metadata?: Record<string, unknown>;
};

type IngestionRunResult = {
  success_count: number;
  error_count: number;
  metadata?: Record<string, unknown>;
};
```

### 6. 타입 (`types.ts`)

공통 DB 타입을 정의합니다.

```typescript
import type { PositionRow, WorkerStatusData } from '@workspace/db-client';
```

## 사용 규칙

### 1. 공통 함수 우선 사용

```typescript
// ✅ 권장: 공통 함수 사용
import { loadCryptoPositions } from '@workspace/db-client';
const positions = await loadCryptoPositions({ broker: 'UPBIT' });

// ⚠️ 필요시: 직접 쿼리
import { getSupabase } from '@workspace/db-client';
const { data } = await getSupabase()
  .from('positions')
  .select('*')
  .eq('broker', 'UPBIT');
```

### 2. 에러 처리 필수

```typescript
import { getSupabase } from '@workspace/db-client';

const { data, error } = await getSupabase()
  .from('table')
  .select('*');

// ❌ 금지: 에러 무시
// if (data) { ... }

// ✅ 권장: 에러 체크
if (error) {
  logger.error('쿼리 실패', { error });
  throw new Error(`Query failed: ${error.message}`);
}

// data 사용
```

### 3. 타입 안전성 보장

```typescript
import { getSupabase } from '@workspace/db-client';

const { data, error } = await getSupabase()
  .from('positions')
  .select('*')
  .eq('symbol', 'KRW-BTC')
  .single();

if (error) throw new Error(error.message);

// 타입 가드 사용
if (!data || typeof data.qty !== 'number') {
  throw new Error('Invalid data shape');
}

const qty = data.qty;  // 타입 안전
```

## 사용 예시

### 전체 워크플로우

```typescript
import {
  getSupabase,
  loadCryptoPositions,
  upsertWorkerStatus,
  insertIngestionRun,
  finishIngestionRun,
} from '@workspace/db-client';
import { nowIso, createLogger } from '@workspace/shared-utils';

const logger = createLogger('my-collector');

async function collectData() {
  // 1. 배치 시작
  const runId = await insertIngestionRun({
    source: 'my-collector',
    target_count: 100,
  });

  try {
    // 2. 데이터 수집
    const positions = await loadCryptoPositions({ broker: 'UPBIT' });
    logger.info('포지션 조회', { count: positions.length });

    // 3. 데이터 저장 (직접 쿼리)
    const supabase = getSupabase();
    const { error } = await supabase
      .from('candles')
      .upsert(candlesData, { onConflict: 'symbol,candle_time' });

    if (error) throw new Error(error.message);

    // 4. 배치 완료
    await finishIngestionRun(runId, {
      success_count: 100,
      error_count: 0,
    });

    // 5. 워커 상태 업데이트
    await upsertWorkerStatus({
      worker_id: 'my-collector',
      last_run_at: nowIso(),
      status: 'ok',
    });

  } catch (error) {
    logger.error('수집 실패', error);

    // 배치 실패 기록
    await finishIngestionRun(runId, {
      success_count: 0,
      error_count: 100,
      metadata: { error: String(error) },
    });

    throw error;
  }
}
```

### 복잡한 쿼리

```typescript
import { getSupabase } from '@workspace/db-client';

// 최근 24시간 캔들 조회
const { data: candles, error } = await getSupabase()
  .from('upbit_candles')
  .select('close, candle_time')
  .eq('symbol', 'KRW-BTC')
  .gte('candle_time', new Date(Date.now() - 86400000).toISOString())
  .order('candle_time', { ascending: false });

if (error) throw new Error(error.message);

// AI 분석 결과 조회 (confidence 높은 순)
const { data: signals, error: signalError } = await getSupabase()
  .from('ai_analysis')
  .select('*')
  .eq('decision', 'BUY')
  .gte('confidence', 0.7)
  .order('confidence', { ascending: false })
  .limit(10);

if (signalError) throw new Error(signalError.message);
```

### 트랜잭션 (RPC 함수)

```typescript
import { getSupabase } from '@workspace/db-client';

// PostgreSQL 함수 호출
const { data: tradeId, error } = await getSupabase()
  .rpc('execute_trade', {
    p_symbol: 'AAPL',
    p_broker: 'KIS',
    p_market: 'US',
    p_side: 'BUY',
    p_qty: 10,
    p_price: 150.50,
  });

if (error) throw new Error(error.message);

logger.info('거래 실행', { tradeId });
```

## 의존성

- **@supabase/supabase-js**: Supabase 클라이언트
- **@workspace/shared-utils**: 환경변수, 로깅

## 확장 가이드

### 새 공통 함수 추가

1. 새 파일 생성 (예: `src/new-feature.ts`)
2. 타입 정의 (`src/types.ts`)
3. 함수 작성
4. `src/index.ts`에서 export
5. 이 README에 문서 추가

```typescript
// src/new-feature.ts
import { getSupabase } from './client';
import type { NewFeatureData } from './types';

export async function insertNewFeature(data: NewFeatureData): Promise<void> {
  const { error } = await getSupabase()
    .from('new_feature')
    .insert(data);

  if (error) {
    throw new Error(`Failed to insert: ${error.message}`);
  }
}
```

```typescript
// src/index.ts
export * from './client';
export * from './new-feature';
export type * from './types';
```

## 테스트

```bash
# 타입 체크
yarn check-types

# 린트
yarn lint
```

## 라이선스

Private
