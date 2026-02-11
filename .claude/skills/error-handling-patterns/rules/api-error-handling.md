# API 에러 처리

HTTP API 호출 에러를 처리하는 패턴입니다.

## 기본 패턴

```typescript
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('api-client');

async function callExternalApi(url: string) {
  try {
    const response = await fetch(url, {
      timeout: 5000,
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // HTTP 상태 코드 체크
    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('API 에러 응답', {
        url,
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      });
      throw new Error(`API error: ${response.status} ${errorBody}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('API 호출 실패', { url, error });
    throw error;
  }
}
```

## 상태 코드별 처리

### 2xx (성공)

```typescript
if (response.ok) {  // 200-299
  return await response.json();
}
```

### 4xx (클라이언트 에러)

```typescript
if (response.status === 400) {
  // Bad Request - 파라미터 검증 실패
  logger.error('잘못된 요청', { url, params });
  throw new Error('Bad request');
}

if (response.status === 401) {
  // Unauthorized - 인증 실패
  logger.error('인증 실패', { url });
  throw new Error('Unauthorized - check API key');
}

if (response.status === 403) {
  // Forbidden - 권한 없음
  logger.error('권한 없음', { url });
  throw new Error('Forbidden');
}

if (response.status === 404) {
  // Not Found - 리소스 없음
  logger.warn('리소스 없음', { url });
  return null;  // 또는 throw
}

if (response.status === 429) {
  // Too Many Requests - 레이트 리밋
  const retryAfter = response.headers.get('Retry-After');
  logger.warn('레이트 리밋 초과', { url, retryAfter });
  throw new Error(`Rate limit exceeded, retry after: ${retryAfter}`);
}
```

### 5xx (서버 에러)

```typescript
if (response.status >= 500) {
  // 5xx - 서버 에러 (재시도 가능)
  logger.error('서버 에러', {
    url,
    status: response.status,
  });
  throw new Error(`Server error: ${response.status}`);
}
```

## 네트워크 에러 처리

```typescript
async function callApiSafe(url: string) {
  try {
    const response = await fetch(url);
    return response;
  } catch (error) {
    // 네트워크 에러 감지
    if (error instanceof TypeError && error.message.includes('fetch')) {
      logger.error('네트워크 에러', {
        url,
        error: error.message,
        type: 'NETWORK_ERROR',
      });
      throw new Error(`Network error: ${error.message}`);
    }

    // 타임아웃
    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('타임아웃', { url });
      throw new Error('Request timeout');
    }

    throw error;
  }
}
```

## 타임아웃 설정

```typescript
async function fetchWithTimeout(url: string, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      logger.error('요청 타임아웃', { url, timeoutMs });
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }

    throw error;
  }
}
```

## 재시도 + 백오프

```typescript
import { createBackoff } from '@workspace/shared-utils';

async function callApiWithRetry(url: string, maxAttempts = 3) {
  const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url);

      // 영구적 에러 (재시도 불필요)
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        throw new Error(`Permanent error: ${response.status}`);
      }

      // 일시적 에러 (재시도 가능)
      if (!response.ok) {
        throw new Error(`Transient error: ${response.status}`);
      }

      backoff.reset();
      return await response.json();
    } catch (error) {
      const isPermanent = error instanceof Error &&
        error.message.includes('Permanent');

      if (isPermanent || attempt === maxAttempts - 1) {
        throw error;
      }

      const delayMs = backoff.nextDelayMs();
      logger.warn('API 재시도', { url, attempt, delayMs, error });
      await sleep(delayMs);
    }
  }

  throw new Error('Unreachable');
}
```

## 레이트 리밋 처리

```typescript
async function callApiWithRateLimit(url: string) {
  try {
    const response = await fetch(url);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;

      logger.warn('레이트 리밋, 대기 중', { url, waitMs });
      await sleep(waitMs);

      // 재시도
      return await fetch(url);
    }

    return response;
  } catch (error) {
    logger.error('API 호출 실패', { url, error });
    throw error;
  }
}
```

## 응답 검증

```typescript
import { z } from 'zod';

const ResponseSchema = z.object({
  status: z.string(),
  data: z.array(z.object({
    id: z.number(),
    name: z.string(),
  })),
});

async function callApiWithValidation(url: string) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  const raw = await response.json();

  // 런타임 검증
  const parsed = ResponseSchema.safeParse(raw);

  if (!parsed.success) {
    logger.error('응답 검증 실패', {
      url,
      error: parsed.error.errors,
      receivedData: raw,
    });
    throw new Error('Invalid API response');
  }

  return parsed.data;
}
```

## 에러 응답 파싱

### JSON 에러 응답

```typescript
async function handleJsonErrorResponse(response: Response) {
  if (!response.ok) {
    try {
      const errorData = await response.json();
      logger.error('API 에러 (JSON)', {
        status: response.status,
        error: errorData,
      });
      throw new Error(errorData.message || `API error: ${response.status}`);
    } catch (parseError) {
      // JSON 파싱 실패
      const text = await response.text();
      logger.error('API 에러 (텍스트)', {
        status: response.status,
        body: text,
      });
      throw new Error(`API error: ${response.status}`);
    }
  }

  return await response.json();
}
```

### 구조화된 에러 응답

```typescript
// KIS API 에러 응답 예시
const KisErrorSchema = z.object({
  rt_cd: z.string(),  // 결과 코드
  msg_cd: z.string(),  // 메시지 코드
  msg1: z.string(),    // 메시지
});

async function handleKisErrorResponse(response: Response) {
  const raw = await response.json();

  // 에러 체크
  if (raw.rt_cd !== '0') {
    const error = KisErrorSchema.parse(raw);
    logger.error('KIS API 에러', {
      code: error.rt_cd,
      messageCode: error.msg_cd,
      message: error.msg1,
    });
    throw new Error(`KIS error: ${error.msg1}`);
  }

  return raw;
}
```

## 전체 통합 예시

```typescript
import { createBackoff, createLogger } from '@workspace/shared-utils';
import { z } from 'zod';

const logger = createLogger('api-client');

async function robustApiCall(url: string, options: RequestInit = {}) {
  const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // 1. 타임아웃 설정
      const response = await fetchWithTimeout(url, 5000);

      // 2. HTTP 상태 코드 체크
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Permanent: ${response.status}`);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : 60000;
        logger.warn('레이트 리밋', { waitMs });
        await sleep(waitMs);
        continue;
      }

      if (!response.ok) {
        throw new Error(`Transient: ${response.status}`);
      }

      // 3. 응답 파싱
      const raw = await response.json();

      // 4. 스키마 검증
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) {
        logger.error('스키마 검증 실패', {
          error: parsed.error.errors,
        });
        throw new Error('Invalid response');
      }

      // 성공
      backoff.reset();
      return parsed.data;

    } catch (error) {
      const isPermanent = error instanceof Error &&
        error.message.includes('Permanent');

      if (isPermanent || attempt === maxAttempts - 1) {
        logger.error('API 호출 최종 실패', { url, error });
        throw error;
      }

      const delayMs = backoff.nextDelayMs();
      logger.warn('API 재시도', { url, attempt, delayMs });
      await sleep(delayMs);
    }
  }

  throw new Error('Unreachable');
}
```

## 베스트 프랙티스

1. **항상 HTTP 상태 코드 확인**
   ```typescript
   // ✅ 좋음
   if (!response.ok) throw new Error(response.status);

   // ❌ 나쁨
   return await response.json();  // 상태 무시
   ```

2. **4xx와 5xx 구분**
   ```typescript
   // ✅ 좋음: 4xx는 재시도 안 함, 5xx는 재시도
   if (status >= 400 && status < 500) throw new Error('Client error');
   if (status >= 500) throw new Error('Server error');

   // ❌ 나쁨: 모두 재시도
   if (!response.ok) await retry();
   ```

3. **타임아웃 설정**
   ```typescript
   // ✅ 좋음
   const response = await fetchWithTimeout(url, 5000);

   // ❌ 나쁨
   const response = await fetch(url);  // 무한 대기 가능
   ```

4. **에러 응답 로깅**
   ```typescript
   // ✅ 좋음
   logger.error('API 에러', {
     url,
     status,
     body: errorBody.substring(0, 1000),
   });

   // ❌ 나쁨
   logger.error('에러', error);
   ```

---

**관련 문서:**
- [External API Integration](../../external-api-integration/SKILL.md)
- [에러 분류](./error-classification.md)
- [재시도 + 백오프](./retry-backoff.md)
