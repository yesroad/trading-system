# 에러 로깅 표준

구조화된 에러 로깅 패턴입니다.

## 기본 패턴

```typescript
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('service-name');

try {
  const result = await riskyOperation(param1, param2);
} catch (error) {
  logger.error('작업 실패', {
    operation: 'riskyOperation',
    context: { param1, param2 },
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
    } : String(error),
  });
  throw error;
}
```

## 로그 레벨

| 레벨 | 용도 | 예시 |
|------|------|------|
| `debug` | 상세 디버깅 정보 | 중간 계산 결과, 상태 변경 |
| `info` | 일반 정보 | 서비스 시작, 정상 완료 |
| `warn` | 경고 (복구 가능) | 재시도, 선택적 기능 실패 |
| `error` | 에러 (복구 불가) | 필수 작업 실패, 예외 발생 |

### 로그 레벨 선택 가이드

```typescript
// debug: 개발/디버깅 시에만 필요
logger.debug('계산 결과', { intermediate: value });

// info: 정상 동작
logger.info('서비스 시작', { port: 3000 });
logger.info('데이터 수집 완료', { count: 100 });

// warn: 문제가 있지만 계속 진행 가능
logger.warn('선택적 데이터 조회 실패', { id, error });
logger.warn('재시도 예정', { attempt, delayMs });

// error: 심각한 문제, 작업 실패
logger.error('필수 데이터 조회 실패', { id, error });
logger.error('API 호출 실패', { url, error });
```

## 에러 객체 직렬화

### 기본 직렬화

```typescript
// ✅ 좋음: Error 객체를 구조화
logger.error('작업 실패', {
  error: error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack,
  } : String(error),
});

// ❌ 나쁨: Error 객체 직접 전달
logger.error('작업 실패', { error });  // [object Object]
```

### 헬퍼 함수

```typescript
function serializeError(error: unknown): object {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      // 추가 속성이 있으면 포함
      ...(error as any),
    };
  }

  if (typeof error === 'object' && error !== null) {
    return error;
  }

  return { message: String(error) };
}

// 사용
logger.error('작업 실패', {
  error: serializeError(error),
});
```

## 컨텍스트 정보 포함

### 최소 컨텍스트

```typescript
// ✅ 필수 정보만
logger.error('데이터 조회 실패', {
  operation: 'loadData',
  id: userId,
  error: serializeError(error),
});
```

### 풍부한 컨텍스트

```typescript
// ✅ 디버깅에 유용한 추가 정보
logger.error('API 호출 실패', {
  operation: 'callExternalApi',
  url,
  method: 'GET',
  headers: { 'Content-Type': 'application/json' },  // 민감 정보 제외
  params: { symbol, count },
  error: serializeError(error),
  timestamp: new Date().toISOString(),
  attemptNumber: 2,
});
```

## 민감 정보 제외

```typescript
// ❌ 나쁨: API 키 노출
logger.info('API 호출', {
  url,
  headers: {
    'Authorization': `Bearer ${apiKey}`,  // 절대 금지
  },
});

// ✅ 좋음: 민감 정보 마스킹
logger.info('API 호출', {
  url,
  headers: {
    'Authorization': 'Bearer ***',  // 마스킹
  },
});

// ✅ 더 좋음: 민감 헤더 제외
logger.info('API 호출', {
  url,
  headers: {
    'Content-Type': 'application/json',
    // Authorization 제외
  },
});
```

### 마스킹 헬퍼

```typescript
function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ['authorization', 'api_key', 'secret', 'password', 'token'];
  const masked: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(sk => lowerKey.includes(sk))) {
      masked[key] = '***';
    } else {
      masked[key] = value;
    }
  }

  return masked;
}

// 사용
logger.info('API 호출', {
  headers: maskSensitiveData(headers),
});
```

## HTTP 응답 로깅

```typescript
async function callApi(url: string) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      const errorBody = await response.text();

      logger.error('API 에러 응답', {
        url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        body: errorBody.substring(0, 1000),  // 최대 1000자
      });

      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    logger.error('API 호출 실패', {
      url,
      error: serializeError(error),
    });
    throw error;
  }
}
```

## DB 쿼리 로깅

```typescript
async function loadData(id: string) {
  logger.debug('데이터 조회 시작', { id });

  const { data, error } = await getSupabase()
    .from('table')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    logger.error('DB 쿼리 실패', {
      operation: 'loadData',
      table: 'table',
      id,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
      },
    });
    throw new Error(`DB error: ${error.message}`);
  }

  logger.debug('데이터 조회 성공', { id, dataSize: JSON.stringify(data).length });

  return data;
}
```

## 성능 로깅

```typescript
async function expensiveOperation() {
  const startTime = Date.now();

  try {
    const result = await doWork();

    const duration = Date.now() - startTime;
    logger.info('작업 완료', {
      operation: 'expensiveOperation',
      durationMs: duration,
      resultSize: result.length,
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('작업 실패', {
      operation: 'expensiveOperation',
      durationMs: duration,
      error: serializeError(error),
    });
    throw error;
  }
}
```

## 구조화된 로그 포맷

### 출력 예시

```json
{
  "timestamp": "2026-02-11T12:34:56.789Z",
  "level": "error",
  "service": "kis-collector",
  "message": "API 호출 실패",
  "data": {
    "url": "https://api.example.com/data",
    "method": "GET",
    "error": {
      "name": "Error",
      "message": "Network timeout",
      "stack": "Error: Network timeout\n    at ..."
    }
  }
}
```

### 로그 분석

```bash
# 에러 로그만 필터링
cat service.log | grep '"level":"error"'

# 특정 작업의 로그만
cat service.log | grep '"operation":"loadData"'

# JSON 파싱하여 분석
cat service.log | jq 'select(.level == "error") | .data.error.message'
```

## 베스트 프랙티스

1. **항상 구조화된 로깅**
   ```typescript
   // ✅ 좋음
   logger.error('작업 실패', { operation, error });

   // ❌ 나쁨
   console.log('Error:', error);
   ```

2. **에러는 항상 로깅 + throw**
   ```typescript
   // ✅ 좋음
   if (error) {
     logger.error('실패', { error });
     throw error;
   }

   // ❌ 나쁨: 로깅만 하고 throw 안 함
   if (error) {
     logger.error('실패', { error });
   }
   ```

3. **중요한 작업은 시작/완료 로깅**
   ```typescript
   // ✅ 좋음
   logger.info('배치 시작', { targetCount });
   // ... 작업 ...
   logger.info('배치 완료', { successCount, errorCount });
   ```

4. **로그 레벨을 일관되게**
   ```typescript
   // ✅ 좋음: 재시도는 warn
   logger.warn('재시도', { attempt });

   // ❌ 나쁨: 재시도를 error로
   logger.error('재시도', { attempt });
   ```

---

**관련 문서:**
- [Shared Utils - Logger](../../../../packages/shared-utils/README.md#3-로깅-loggerts)
- [에러 분류](./error-classification.md)
