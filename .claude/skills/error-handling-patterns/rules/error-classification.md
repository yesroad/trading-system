# 에러 분류

모든 에러는 다음 4가지 카테고리로 분류하고, 각 카테고리에 맞는 처리 방법을 적용합니다.

## 1. 일시적 에러 (Transient)

**특징:**
- 일시적인 문제로 발생
- 재시도하면 성공 가능성 높음
- 서버 측 문제 또는 네트워크 문제

**처리 방법:** 재시도 + 백오프

**예시:**
- 네트워크 타임아웃
- 503 Service Unavailable
- 429 Too Many Requests
- 일시적인 DB 연결 실패
- 락 충돌 (Lock timeout)

**구현:**
```typescript
import { createBackoff, createLogger } from '@workspace/shared-utils';

const logger = createLogger('service');
const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

async function fetchWithRetry(url: string, maxAttempts = 3) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);

      // 일시적 에러 체크
      if (response.status >= 500 || response.status === 429) {
        throw new Error(`Transient error: ${response.status}`);
      }

      backoff.reset();
      return response;
    } catch (error) {
      logger.warn('재시도', { attempt, error });

      if (attempt === maxAttempts - 1) throw error;

      const delayMs = backoff.nextDelayMs();
      await sleep(delayMs);
    }
  }
}
```

## 2. 영구적 에러 (Permanent)

**특징:**
- 재시도해도 성공 불가능
- 설정 또는 권한 문제
- 클라이언트 측 문제

**처리 방법:** 로깅 + 즉시 throw

**예시:**
- 401 Unauthorized (잘못된 API 키)
- 403 Forbidden (권한 없음)
- 404 Not Found (리소스 없음)
- 400 Bad Request (잘못된 파라미터)
- 유효하지 않은 환경변수

**구현:**
```typescript
function isPermanentError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('unauthorized') ||
      message.includes('forbidden') ||
      message.includes('not found') ||
      message.includes('bad request')
    );
  }

  // HTTP 상태 코드로 판단
  if (typeof error === 'object' && error !== null && 'status' in error) {
    const status = (error as any).status;
    return status === 401 || status === 403 || status === 404 || status === 400;
  }

  return false;
}

async function callApi(url: string) {
  try {
    const response = await fetch(url);

    // 영구적 에러는 즉시 throw
    if (!response.ok) {
      const status = response.status;
      if (status === 401 || status === 403 || status === 404 || status === 400) {
        logger.error('영구적 에러', { status, url });
        throw new Error(`Permanent error: ${status}`);
      }
    }

    return response;
  } catch (error) {
    if (isPermanentError(error)) {
      logger.error('영구적 에러 감지', { error });
      throw error;  // 즉시 throw, 재시도 안 함
    }
    throw error;
  }
}
```

## 3. 복구 가능 에러 (Recoverable)

**특징:**
- 에러가 발생해도 전체 작업은 계속 가능
- 선택적 데이터 조회 실패
- 부가 기능 실패

**처리 방법:** 로깅 + 기본값 반환 + 계속

**예시:**
- 선택적 메타데이터 조회 실패
- 캐시 읽기 실패 (DB에서 다시 조회 가능)
- 알림 전송 실패 (핵심 기능 아님)
- 선택적 설정 로드 실패

**구현:**
```typescript
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('service');

// 필수 데이터 (throw)
async function loadRequiredData(id: string) {
  const { data, error } = await getSupabase()
    .from('required_table')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    logger.error('필수 데이터 조회 실패', { id, error });
    throw new Error(`Failed to load required data: ${error.message}`);
  }

  return data;
}

// 선택적 데이터 (기본값 반환)
async function loadOptionalMetadata(id: string) {
  try {
    const { data, error } = await getSupabase()
      .from('optional_metadata')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      logger.warn('선택적 메타데이터 조회 실패', { id, error });
      return null;  // 기본값 반환
    }

    return data;
  } catch (error) {
    logger.warn('메타데이터 조회 예외', { id, error });
    return null;  // 계속 진행
  }
}

// 사용
async function processData(id: string) {
  const required = await loadRequiredData(id);  // 실패 시 throw
  const metadata = await loadOptionalMetadata(id);  // 실패해도 계속

  return {
    ...required,
    metadata: metadata ?? { default: true },  // 기본값 사용
  };
}
```

## 4. 치명적 에러 (Fatal)

**특징:**
- 서비스 전체가 동작 불가능
- 복구 불가능
- 즉시 프로세스 종료 필요

**처리 방법:** 로깅 + throw + 프로세스 종료

**예시:**
- DB 연결 실패
- 필수 환경변수 누락
- 메모리 부족 (OOM)
- 디스크 공간 부족
- 초기화 실패

**구현:**
```typescript
import { requireEnv, createLogger } from '@workspace/shared-utils';

const logger = createLogger('service');

async function initialize() {
  try {
    // 1. 필수 환경변수 체크
    const dbUrl = requireEnv('SUPABASE_URL');  // 없으면 throw
    const dbKey = requireEnv('SUPABASE_KEY');

    // 2. DB 연결 체크
    const { error } = await getSupabase()
      .from('system_guard')
      .select('id')
      .limit(1);

    if (error) {
      logger.error('DB 연결 실패', { error });
      throw new Error('Fatal: Database connection failed');
    }

    logger.info('초기화 성공');
  } catch (error) {
    logger.error('치명적 에러: 초기화 실패', { error });

    // 프로세스 종료
    process.exit(1);
  }
}

// 서비스 시작
initialize().then(() => {
  logger.info('서비스 시작');
  startMainLoop();
}).catch(error => {
  logger.error('시작 실패', { error });
  process.exit(1);
});
```

## 판단 기준

에러가 어느 카테고리에 속하는지 판단하는 기준:

```typescript
function classifyError(error: unknown): 'transient' | 'permanent' | 'recoverable' | 'fatal' {
  // 1. 치명적 에러 (최우선)
  if (error instanceof Error) {
    if (error.message.includes('ECONNREFUSED') ||
        error.message.includes('Database connection') ||
        error.message.includes('Required env')) {
      return 'fatal';
    }
  }

  // 2. 영구적 에러
  if (isPermanentError(error)) {
    return 'permanent';
  }

  // 3. 일시적 에러 (기본)
  return 'transient';

  // 4. 복구 가능 에러는 컨텍스트에 따라 개발자가 직접 판단
}
```

## 베스트 프랙티스

1. **에러 카테고리를 명시적으로 표시**
   ```typescript
   // ✅ 좋음
   throw new Error('Transient: Network timeout');
   throw new Error('Permanent: Invalid API key');

   // ❌ 나쁨
   throw new Error('Error occurred');
   ```

2. **재시도 로직은 일시적 에러에만 적용**
   ```typescript
   // ✅ 좋음
   if (isTransientError(error)) {
     await retry();
   } else {
     throw error;
   }

   // ❌ 나쁨
   await retry();  // 모든 에러에 재시도
   ```

3. **로그 레벨을 에러 카테고리에 맞게**
   ```typescript
   // 일시적: warn (재시도 예정)
   logger.warn('일시적 에러', { error });

   // 영구적: error (재시도 불가)
   logger.error('영구적 에러', { error });

   // 복구 가능: warn (계속 진행)
   logger.warn('선택적 기능 실패', { error });

   // 치명적: error (종료)
   logger.error('치명적 에러', { error });
   ```

---

**관련 문서:**
- [재시도 + 백오프](./retry-backoff.md)
- [로깅 표준](./logging-standards.md)
