# 재시도 + 백오프

일시적 에러에 대한 재시도 전략 및 백오프 패턴입니다.

## 기본 패턴

```typescript
import { createBackoff, createLogger } from '@workspace/shared-utils';

const logger = createLogger('service-name');
const backoff = createBackoff({
  baseMs: 1000,      // 초기 대기: 1초
  maxMs: 30000,      // 최대 대기: 30초
  jitterMs: 500,     // 지터: ±500ms
});

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastError: Error | unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      backoff.reset();  // 성공 시 백오프 리셋
      return result;
    } catch (error) {
      lastError = error;

      // 영구적 에러는 즉시 throw
      if (isPermanentError(error)) {
        throw error;
      }

      // 마지막 시도면 throw
      if (attempt === maxAttempts - 1) {
        break;
      }

      const delayMs = backoff.nextDelayMs();
      logger.warn('재시도 예정', {
        attempt: attempt + 1,
        maxAttempts,
        delayMs,
        error: String(error)
      });

      await sleep(delayMs);
    }
  }

  throw lastError;
}

function isPermanentError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('unauthorized') ||
           message.includes('forbidden') ||
           message.includes('not found');
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

## 사용 예시

### 1. API 호출

```typescript
const data = await fetchWithRetry(async () => {
  const response = await fetch('https://api.example.com/data');

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return await response.json();
}, 3);  // 최대 3번 시도
```

### 2. DB 쿼리

```typescript
const data = await fetchWithRetry(async () => {
  const { data, error } = await getSupabase()
    .from('table')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    throw new Error(`DB error: ${error.message}`);
  }

  return data;
}, 5);  // 최대 5번 시도
```

### 3. 파일 I/O

```typescript
import fs from 'fs/promises';

const content = await fetchWithRetry(async () => {
  return await fs.readFile('/path/to/file', 'utf-8');
}, 3);
```

## 백오프 전략

### 지수 백오프 (Exponential Backoff)

재시도할 때마다 대기 시간을 지수적으로 증가시킵니다.

```
시도 1: 1초 대기
시도 2: 2초 대기
시도 3: 4초 대기
시도 4: 8초 대기
시도 5: 16초 대기 (최대 30초)
```

### 지터 (Jitter)

대기 시간에 랜덤 요소를 추가하여 동시 재시도를 분산시킵니다.

```typescript
// 지터 없음: 모든 클라이언트가 동시에 재시도 → 서버 부하
// 1초, 2초, 4초, 8초, 16초

// 지터 있음: 재시도 시간이 분산됨 → 서버 부하 감소
// 0.8초, 2.3초, 3.7초, 8.5초, 15.2초
```

**구현:**
```typescript
const backoff = createBackoff({
  baseMs: 1000,
  maxMs: 30000,
  jitterMs: 500,  // ±500ms 랜덤
});

// nextDelayMs() 호출 시마다 다른 값 반환
// 1000 ± 500 = 500~1500ms
// 2000 ± 500 = 1500~2500ms
```

## 재시도 횟수 결정

| 작업 유형 | 권장 재시도 횟수 | 이유 |
|----------|----------------|------|
| 중요한 DB 쿼리 | 5회 | 일시적 락 충돌 가능 |
| 일반 API 호출 | 3회 | 네트워크 문제 일시적 |
| 파일 I/O | 3회 | 일시적 락 또는 권한 |
| KIS API | 3회 | 토큰 쿨다운 별도 처리 |
| 선택적 작업 | 1회 | 중요도 낮음 |

## 재시도하지 말아야 할 경우

### 1. 영구적 에러

```typescript
// ❌ 재시도 안 함
if (response.status === 401 || response.status === 403) {
  throw new Error('Permanent error: Unauthorized');
}
```

### 2. 멱등성 없는 작업

```typescript
// ❌ 재시도 위험: 중복 주문 가능
async function placeOrder(order: Order) {
  // 재시도하면 주문이 여러 번 실행될 수 있음
  return await kisApi.placeOrder(order);
}

// ✅ 멱등성 보장: 주문 ID로 중복 방지
async function placeOrderSafe(order: Order) {
  const orderId = generateOrderId();  // 고유 ID
  return await kisApi.placeOrder({ ...order, orderId });
}
```

### 3. 사용자 입력 오류

```typescript
// ❌ 재시도 안 함: 사용자가 수정해야 함
if (response.status === 400) {
  throw new Error('Bad request: Invalid parameters');
}
```

## 고급 패턴

### 1. 조건부 재시도

```typescript
async function fetchWithConditionalRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown, attempt: number) => boolean,
  maxAttempts = 3
): Promise<T> {
  const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      // 커스텀 재시도 조건
      if (!shouldRetry(error, attempt)) {
        throw error;
      }

      if (attempt === maxAttempts - 1) {
        throw error;
      }

      await sleep(backoff.nextDelayMs());
    }
  }

  throw new Error('Unreachable');
}

// 사용
const data = await fetchWithConditionalRetry(
  async () => await callApi(),
  (error, attempt) => {
    // 5xx 에러만 재시도
    if (error instanceof Error) {
      const is5xx = error.message.includes('50');
      return is5xx && attempt < 3;
    }
    return false;
  }
);
```

### 2. 재시도 콜백

```typescript
async function fetchWithRetryCallback<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    onRetry?: (attempt: number, error: unknown) => void;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, onRetry } = options;
  const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isPermanentError(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      // 재시도 콜백 호출
      onRetry?.(attempt, error);

      await sleep(backoff.nextDelayMs());
    }
  }

  throw new Error('Unreachable');
}

// 사용
const data = await fetchWithRetryCallback(
  async () => await callApi(),
  {
    maxAttempts: 5,
    onRetry: (attempt, error) => {
      logger.warn('재시도', { attempt, error });
      // 메트릭 수집, 알림 등
    }
  }
);
```

## 베스트 프랙티스

1. **재시도 횟수에 상한 설정**
   ```typescript
   // ✅ 좋음
   for (let i = 0; i < 3; i++) { ... }

   // ❌ 나쁨
   while (true) { ... }  // 무한 루프
   ```

2. **백오프 지연 시간에 상한 설정**
   ```typescript
   // ✅ 좋음
   const backoff = createBackoff({ maxMs: 30000 });

   // ❌ 나쁨
   const delayMs = Math.pow(2, attempt) * 1000;  // 무한 증가
   ```

3. **성공 시 백오프 리셋**
   ```typescript
   // ✅ 좋음
   try {
     const result = await fn();
     backoff.reset();  // 다음 실패를 위해 리셋
     return result;
   } catch { ... }
   ```

4. **재시도 로직을 재사용 가능하게**
   ```typescript
   // ✅ 좋음: 헬퍼 함수로 추출
   const data = await fetchWithRetry(() => callApi());

   // ❌ 나쁨: 매번 재작성
   for (let i = 0; i < 3; i++) {
     try { ... } catch { ... }
   }
   ```

---

**관련 문서:**
- [에러 분류](./error-classification.md)
- [Shared Utils - Backoff](../../../../packages/shared-utils/README.md#4-백오프-backoffts)
