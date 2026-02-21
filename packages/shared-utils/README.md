# @workspace/shared-utils

모든 서비스와 패키지에서 공유하는 기초 유틸리티 라이브러리입니다.

## 개요

이 패키지는 trading-system 모노레포의 모든 워크스페이스에서 사용하는 공통 기능을 제공합니다:

- 환경변수 접근 및 검증
- 날짜/시간 유틸리티 (Luxon 기반)
- 구조화된 로깅
- 지수 백오프 + 지터
- 공용 타입 정의

## 설치

```bash
# 다른 워크스페이스에서 사용
yarn workspace your-workspace add @workspace/shared-utils@*
```

## 주요 모듈

### 1. 환경변수 (`env.ts`)

환경변수를 안전하게 접근하고 검증합니다.

#### `requireEnv(key: string): string`

필수 환경변수를 조회합니다. 존재하지 않으면 예외를 발생시킵니다.

```typescript
import { requireEnv } from '@workspace/shared-utils';

const dbUrl = requireEnv('SUPABASE_URL'); // 없으면 throw
const apiKey = requireEnv('API_KEY');
```

#### `env(key: string): string | undefined`

선택적 환경변수를 조회합니다.

```typescript
import { env } from '@workspace/shared-utils';

const debug = env('DEBUG'); // 없으면 undefined
```

#### `envNumber(key: string, defaultValue?: number): number | undefined`

숫자형 환경변수를 조회합니다. 값이 없으면 `defaultValue`를 반환하고, `defaultValue`도 없으면 `undefined`를 반환합니다.

```typescript
import { envNumber } from '@workspace/shared-utils';

const timeout = envNumber('TIMEOUT_MS', 5000); // 기본값 5000
const port = envNumber('PORT', 3000);
```

#### `envBoolean(key: string, defaultValue: boolean): boolean`

불린 환경변수를 조회합니다 ('true', '1' → true, 그 외 → false).

```typescript
import { envBoolean } from '@workspace/shared-utils';

const isProduction = envBoolean('IS_PRODUCTION', false);
const enableCache = envBoolean('ENABLE_CACHE', true);
```

### 2. 날짜/시간 (`date.ts`)

Luxon 기반 날짜 유틸리티를 제공합니다.

#### `nowIso(): string`

현재 UTC 시각을 ISO 8601 문자열로 반환합니다.

```typescript
import { nowIso } from '@workspace/shared-utils';

const now = nowIso(); // '2026-02-11T12:34:56.789Z'
```

#### `normalizeUtcIso(utcLike: string): string`

UTC 유사 문자열을 정규화된 ISO 문자열로 변환합니다.

```typescript
import { normalizeUtcIso } from '@workspace/shared-utils';

const iso1 = normalizeUtcIso('2026-02-11T12:34:56Z');
const iso2 = normalizeUtcIso('2026-02-11T12:34:56');
```

#### `toIsoString(value: DateTime | string): string`

DateTime 또는 문자열을 UTC ISO 문자열로 변환합니다. 유효하지 않은 값은 예외를 발생시킵니다.

```typescript
import { toIsoString } from '@workspace/shared-utils';
import { DateTime } from 'luxon';

const iso = toIsoString(DateTime.now());
const iso2 = toIsoString('2026-02-11T12:34:56+09:00');
```

### 3. 로깅 (`logger.ts`)

구조화된 JSON 로깅을 제공합니다.

#### `createLogger(serviceName: string): Logger`

서비스별 로거 인스턴스를 생성합니다.

```typescript
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('my-service');

logger.info('서비스 시작', { port: 3000 });
logger.warn('재시도 중', { attempt: 2 });
logger.error('에러 발생', error);
logger.debug('상세 정보', { data: response });
```

**출력 형식 (JSON):**

```json
{
  "timestamp": "2026-02-11T12:34:56.789Z",
  "level": "info",
  "service": "my-service",
  "message": "서비스 시작",
  "data": { "port": 3000 }
}
```

### 4. 백오프 (`backoff.ts`)

지수 백오프 + 지터를 구현합니다.

#### `createBackoff(opts): Backoff`

백오프 인스턴스를 생성합니다.

```typescript
import { createBackoff } from '@workspace/shared-utils';

const backoff = createBackoff({
  baseMs: 1000, // 초기 대기 시간 (1초)
  maxMs: 30000, // 최대 대기 시간 (30초)
  jitterMs: 500, // 지터 (랜덤 요소)
});

// 사용 예시
let lastError;
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    const result = await fetchData();
    backoff.reset(); // 성공 시 리셋
    return result;
  } catch (error) {
    lastError = error;
    const delayMs = backoff.nextDelayMs();
    logger.warn('재시도', { attempt, delayMs });
    await sleep(delayMs);
  }
}

throw lastError;
```

**메서드:**

- `next()`: 다음 시도로 이동 (내부 카운터 증가)
- `nextDelayMs()`: 다음 대기 시간 계산 (ms)
- `reset()`: 카운터 리셋

### 5. 공용 타입 (`types.ts`)

공통으로 사용하는 타입을 정의합니다.

```typescript
import { Nullable } from '@workspace/shared-utils';

type User = {
  id: string;
  name: string;
  email: Nullable<string>; // string | null
};
```

## 의존성

- **dotenv**: 환경변수 로드
- **luxon**: 날짜/시간 처리

## 사용 규칙

1. **모든 워크스페이스에서 이 패키지 우선 사용**
   - 환경변수 접근: `process.env` 대신 `requireEnv` 사용
   - 날짜: `new Date()` 대신 `nowIso()` 또는 Luxon 사용
   - 로깅: `console.log` 대신 `createLogger` 사용

2. **다른 workspace 패키지 의존 금지**
   - 이 패키지는 최하위 레이어
   - 순환 의존성 방지

3. **최소한의 외부 의존성**
   - 필요시에만 추가
   - 보안 업데이트 고려

## 예시

### 전체 사용 예시

```typescript
import {
  requireEnv,
  envNumber,
  envBoolean,
  nowIso,
  createLogger,
  createBackoff,
} from '@workspace/shared-utils';

// 환경변수 로드
const API_URL = requireEnv('API_URL');
const TIMEOUT_MS = envNumber('TIMEOUT_MS', 5000);
const DEBUG = envBoolean('DEBUG', false);

// 로거 생성
const logger = createLogger('my-service');

// 백오프 생성
const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

// 재시도 로직
async function fetchWithRetry(url: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      logger.info('API 호출', { url, attempt });
      const response = await fetch(url, { timeout: TIMEOUT_MS });
      backoff.reset();
      return response;
    } catch (error) {
      logger.warn('재시도', { attempt, error });
      const delayMs = backoff.nextDelayMs();
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('최대 재시도 횟수 초과');
}

// 사용
const data = await fetchWithRetry(API_URL);
logger.info('데이터 수신', { timestamp: nowIso(), data });
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
