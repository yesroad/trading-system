# DB 에러 처리

Supabase 쿼리 에러를 처리하는 패턴입니다.

## 기본 패턴

```typescript
import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('service-name');

const { data, error } = await getSupabase()
  .from('table')
  .select('*')
  .eq('id', id);

if (error) {
  logger.error('DB 쿼리 실패', { table: 'table', id, error });
  throw new Error(`DB error: ${error.message}`);
}

// data 사용
```

## 필수 데이터 vs 선택적 데이터

### 필수 데이터 (에러 시 throw)

```typescript
async function loadRequiredData(id: string) {
  const { data, error } = await getSupabase()
    .from('required_table')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    logger.error('필수 데이터 조회 실패', {
      table: 'required_table',
      id,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    });
    throw new Error(`Failed to load required data: ${error.message}`);
  }

  if (!data) {
    throw new Error(`Required data not found: ${id}`);
  }

  return data;
}
```

### 선택적 데이터 (에러 시 기본값)

```typescript
async function loadOptionalMetadata(id: string) {
  try {
    const { data, error } = await getSupabase()
      .from('optional_metadata')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.warn('선택적 메타데이터 조회 실패', {
        table: 'optional_metadata',
        id,
        error: error.message,
      });
      return null;  // 기본값 반환
    }

    return data;
  } catch (error) {
    logger.warn('메타데이터 조회 예외', { id, error });
    return null;  // 계속 진행
  }
}
```

## 공통 쿼리 패턴

### single() 쿼리

```typescript
// 단일 행 조회
const { data, error } = await getSupabase()
  .from('table')
  .select('*')
  .eq('id', id)
  .single();

if (error) {
  if (error.code === 'PGRST116') {
    // 데이터 없음
    logger.warn('데이터 없음', { id });
    return null;
  }
  // 기타 에러
  logger.error('쿼리 실패', { error });
  throw new Error(error.message);
}
```

### maybeSingle() 쿼리

```typescript
// 0개 또는 1개 행 조회 (없어도 에러 아님)
const { data, error } = await getSupabase()
  .from('table')
  .select('*')
  .eq('id', id)
  .maybeSingle();

if (error) {
  logger.error('쿼리 실패', { error });
  throw new Error(error.message);
}

if (!data) {
  logger.info('데이터 없음', { id });
  return null;
}
```

### insert/upsert

```typescript
const { data, error } = await getSupabase()
  .from('table')
  .upsert({
    id,
    name,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'id',
  });

if (error) {
  logger.error('upsert 실패', {
    table: 'table',
    data: { id, name },
    error: {
      message: error.message,
      code: error.code,
      details: error.details,
    },
  });
  throw new Error(`Upsert failed: ${error.message}`);
}
```

### update

```typescript
const { data, error } = await getSupabase()
  .from('table')
  .update({ status: 'completed' })
  .eq('id', id);

if (error) {
  logger.error('update 실패', { table: 'table', id, error });
  throw new Error(`Update failed: ${error.message}`);
}

// 영향받은 행 수 확인
if (data && data.length === 0) {
  logger.warn('업데이트된 행 없음', { id });
}
```

### delete

```typescript
const { error } = await getSupabase()
  .from('table')
  .delete()
  .eq('id', id);

if (error) {
  logger.error('delete 실패', { table: 'table', id, error });
  throw new Error(`Delete failed: ${error.message}`);
}
```

## 에러 코드별 처리

```typescript
async function loadDataWithErrorHandling(id: string) {
  const { data, error } = await getSupabase()
    .from('table')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    switch (error.code) {
      case 'PGRST116':  // 데이터 없음
        logger.info('데이터 없음', { id });
        return null;

      case 'PGRST301':  // 타임아웃
        logger.warn('DB 타임아웃', { id });
        throw new Error('Database timeout');

      case '42P01':  // 테이블 없음
        logger.error('테이블 없음', { table: 'table' });
        throw new Error('Table not found');

      case '23505':  // 유니크 제약 위반
        logger.error('중복 키', { id });
        throw new Error('Duplicate key');

      default:
        logger.error('알 수 없는 DB 에러', {
          code: error.code,
          message: error.message,
        });
        throw new Error(`DB error: ${error.message}`);
    }
  }

  return data;
}
```

## 재시도 패턴

```typescript
import { createBackoff } from '@workspace/shared-utils';

async function loadDataWithRetry(id: string, maxAttempts = 3) {
  const backoff = createBackoff({ baseMs: 1000, maxMs: 10000 });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const { data, error } = await getSupabase()
        .from('table')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        // 타임아웃이나 일시적 에러는 재시도
        if (error.code === 'PGRST301' || error.message.includes('timeout')) {
          throw new Error(`Transient DB error: ${error.message}`);
        }
        // 영구적 에러는 즉시 throw
        throw new Error(`Permanent DB error: ${error.message}`);
      }

      backoff.reset();
      return data;
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }

      const delayMs = backoff.nextDelayMs();
      logger.warn('DB 재시도', { attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw new Error('Unreachable');
}
```

## 배치 처리

### 대량 insert

```typescript
async function insertMany(items: Item[]) {
  const BATCH_SIZE = 1000;
  const results = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);

    const { data, error } = await getSupabase()
      .from('table')
      .insert(batch);

    if (error) {
      logger.error('배치 insert 실패', {
        batchIndex: i / BATCH_SIZE,
        batchSize: batch.length,
        error,
      });
      throw new Error(`Batch insert failed: ${error.message}`);
    }

    results.push(...(data ?? []));
    logger.info('배치 insert 성공', {
      batchIndex: i / BATCH_SIZE,
      batchSize: batch.length,
    });
  }

  return results;
}
```

## 트랜잭션 (RPC)

```typescript
// PostgreSQL 함수 호출로 트랜잭션 실행
const { data, error } = await getSupabase()
  .rpc('execute_trade', {
    p_symbol: 'AAPL',
    p_broker: 'KIS',
    p_side: 'BUY',
    p_qty: 10,
    p_price: 150.50,
  });

if (error) {
  logger.error('RPC 실행 실패', {
    function: 'execute_trade',
    params: { symbol: 'AAPL', side: 'BUY' },
    error: {
      message: error.message,
      code: error.code,
      details: error.details,
    },
  });
  throw new Error(`Transaction failed: ${error.message}`);
}

logger.info('트랜잭션 성공', { tradeId: data });
```

## 베스트 프랙티스

1. **항상 error 체크**
   ```typescript
   // ✅ 좋음
   const { data, error } = await query();
   if (error) throw new Error(error.message);

   // ❌ 나쁨
   const { data } = await query();  // error 무시
   ```

2. **에러 로깅 시 충분한 컨텍스트**
   ```typescript
   // ✅ 좋음
   logger.error('쿼리 실패', {
     table: 'users',
     operation: 'select',
     id,
     error: { message, code, details },
   });

   // ❌ 나쁨
   logger.error('쿼리 실패', error);
   ```

3. **필수 vs 선택적 구분**
   ```typescript
   // ✅ 좋음: 명확한 구분
   const required = await loadRequired(id);  // throw
   const optional = await loadOptional(id);  // null

   // ❌ 나쁨: 모두 throw
   const data1 = await load1(id);
   const data2 = await load2(id);  // 선택적인데 throw
   ```

4. **재시도는 일시적 에러에만**
   ```typescript
   // ✅ 좋음
   if (error.code === 'PGRST301') {  // 타임아웃
     await retry();
   }

   // ❌ 나쁨
   await retry();  // 모든 에러 재시도
   ```

---

**관련 문서:**
- [DB Client](../../../../packages/db-client/README.md)
- [Database Guide](../../../rules/database-guide.md)
- [에러 분류](./error-classification.md)
