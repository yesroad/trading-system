# @workspace/kis-auth

> 한국투자증권(KIS) API 토큰 관리 패키지

DB 기반으로 KIS API 액세스 토큰을 발급하고 관리하는 공유 패키지입니다. 토큰 캐싱, 자동 갱신, 쿨다운 처리를 지원합니다.

---

## 📋 목차

- [개요](#-개요)
- [주요 기능](#-주요-기능)
- [설치](#-설치)
- [환경변수](#-환경변수)
- [사용법](#-사용법)
- [API 레퍼런스](#-api-레퍼런스)
- [에러 처리](#-에러-처리)
- [작동 원리](#-작동-원리)
- [베스트 프랙티스](#-베스트-프랙티스)

---

## 🎯 개요

**kis-auth**는 한국투자증권 API의 OAuth2 토큰을 관리하는 패키지입니다.

### 핵심 특징

- ✅ **DB 기반 토큰 캐싱** - 여러 서비스가 동일한 토큰 공유
- ✅ **자동 갱신** - 만료 30초 전 자동 갱신
- ✅ **쿨다운 보호** - 발급 실패 시 60초 쿨다운
- ✅ **타입 안전** - TypeScript strict mode
- ✅ **에러 핸들링** - `TokenCooldownError`, `KisTokenError`

---

## ✨ 주요 기능

### 1. 토큰 발급 및 캐싱

```typescript
import { TokenManager } from '@workspace/kis-auth';

const tokenManager = new TokenManager('my-service');
const token = await tokenManager.getToken();
```

- KIS API에서 OAuth2 토큰 발급
- `system_guard` 테이블에 저장
- 유효한 토큰이 있으면 재사용

### 2. 자동 갱신

- 토큰 만료 30초 전에 자동 갱신
- 만료 시각은 `kis_token_expires_at`에 저장
- 갱신 시 `kis_token_issue_count` 증가

### 3. 쿨다운 보호

- 토큰 발급 실패 시 60초 동안 재시도 방지
- `token_cooldown_until`에 쿨다운 해제 시각 저장
- `TokenCooldownError` 발생

### 4. 에러 추적

- 발급 실패 시 에러 정보 DB에 기록
- `kis_token_last_error_at` - 마지막 에러 시각
- `kis_token_last_error_message` - 에러 메시지

---

## 📦 설치

```bash
# 워크스페이스 내부에서 사용 (자동 링크)
yarn workspace @workspace/kis-auth build
```

이 패키지는 monorepo 내부 패키지이며, 다른 워크스페이스에서 참조됩니다.

---

## 🔧 환경변수

### 필수 환경변수

```bash
# KIS API 설정
KIS_ENV=REAL                                    # REAL | PAPER | MOCK | SIM
KIS_REAL_BASE_URL=https://openapi.koreainvestment.com:9443
KIS_PAPER_BASE_URL=https://openapivts.koreainvestment.com:29443
KIS_APP_KEY=your-app-key
KIS_APP_SECRET=your-app-secret

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-key
```

### 환경 모드

- **REAL**: 실전 투자 (실제 계좌)
- **PAPER**: 모의 투자 (가상 계좌)
- **MOCK**: 로컬 개발용
- **SIM**: 시뮬레이션

---

## 🚀 사용법

### 기본 사용

```typescript
import { TokenManager } from '@workspace/kis-auth';

// 1. TokenManager 인스턴스 생성
const tokenManager = new TokenManager('kis-collector');

// 2. 토큰 조회
try {
  const token = await tokenManager.getToken();

  // 3. KIS API 호출
  const response = await fetch('https://openapi.koreainvestment.com:9443/api', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'appkey': KIS_APP_KEY,
      'appsecret': KIS_APP_SECRET,
    },
  });
} catch (error) {
  if (error instanceof TokenCooldownError) {
    console.log('쿨다운 중:', error.remainingMs, 'ms');
    // 쿨다운 해제 대기 또는 스킵
  }
  throw error;
}
```

### 재시도 패턴

```typescript
import { TokenManager, TokenCooldownError } from '@workspace/kis-auth';
import { createBackoff } from '@workspace/shared-utils';

async function getTokenWithRetry(maxAttempts = 3) {
  const tokenManager = new TokenManager('my-service');
  const backoff = createBackoff({ baseMs: 1000, maxMs: 30000 });

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await tokenManager.getToken();
    } catch (error) {
      if (error instanceof TokenCooldownError) {
        console.log('쿨다운 중, 대기:', error.remainingMs, 'ms');
        await sleep(error.remainingMs);
        continue;
      }

      if (attempt === maxAttempts - 1) throw error;

      const delayMs = backoff.nextDelayMs();
      console.warn('토큰 발급 재시도', { attempt, delayMs });
      await sleep(delayMs);
    }
  }

  throw new Error('Max attempts reached');
}
```

---

## 📖 API 레퍼런스

### TokenManager

KIS API 토큰을 관리하는 클래스입니다.

#### `constructor(serviceName?: string)`

TokenManager 인스턴스를 생성합니다.

```typescript
const tokenManager = new TokenManager('my-service');
```

**Parameters:**
- `serviceName` (optional): 서비스 이름 (로깅용)

#### `getToken(): Promise<string>`

유효한 KIS API 토큰을 반환합니다.

```typescript
const token = await tokenManager.getToken();
```

**Returns:** `Promise<string>` - KIS API 액세스 토큰

**Throws:**
- `TokenCooldownError` - 쿨다운 중
- `KisTokenError` - 토큰 발급 실패
- `Error` - DB 조회/저장 실패

**동작:**
1. DB에서 현재 토큰 상태 조회
2. 쿨다운 체크 (60초)
3. 토큰 유효성 확인
4. 유효하면 반환, 만료/없으면 재발급

---

### Errors

#### `TokenCooldownError`

토큰 발급 실패 후 쿨다운 중일 때 발생하는 에러입니다.

```typescript
import { TokenCooldownError } from '@workspace/kis-auth';

try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof TokenCooldownError) {
    console.log('쿨다운 종료까지:', error.remainingMs, 'ms');
    console.log('쿨다운 해제 시각:', new Date(error.untilMs));
  }
}
```

**Properties:**
- `untilMs: number` - 쿨다운 해제 시각 (Unix timestamp)
- `remainingMs: number` - 남은 쿨다운 시간 (ms)
- `message: string` - 에러 메시지

#### `KisTokenError`

KIS API 토큰 발급 실패 시 발생하는 에러입니다.

```typescript
import { KisTokenError } from '@workspace/kis-auth';

try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof KisTokenError) {
    console.error('KIS API 에러:', error.status, error.bodyText);
  }
}
```

**Properties:**
- `status: number` - HTTP 상태 코드
- `bodyText: string` - 에러 응답 본문
- `message: string` - 에러 메시지

---

## ⚠️ 에러 처리

### 1. TokenCooldownError 처리

```typescript
import { TokenCooldownError } from '@workspace/kis-auth';

try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof TokenCooldownError) {
    // 전략 1: 스킵 (다음 배치까지 대기)
    logger.warn('토큰 쿨다운 중, 배치 스킵', {
      remainingSec: Math.ceil(error.remainingMs / 1000),
    });
    return;

    // 전략 2: 대기 후 재시도
    await sleep(error.remainingMs);
    return await tokenManager.getToken();
  }
  throw error;
}
```

### 2. KisTokenError 처리

```typescript
import { KisTokenError } from '@workspace/kis-auth';

try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof KisTokenError) {
    // HTTP 상태 코드별 처리
    if (error.status === 401) {
      logger.error('KIS API 인증 실패 - 키 확인 필요', {
        status: error.status,
      });
      process.exit(1);  // 설정 오류 - 즉시 종료
    }

    if (error.status >= 500) {
      logger.error('KIS API 서버 에러', {
        status: error.status,
        body: error.bodyText,
      });
      // 재시도 또는 쿨다운 대기
    }
  }
  throw error;
}
```

### 3. DB 에러 처리

```typescript
try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof Error && error.message.includes('system_guard')) {
    logger.error('system_guard 테이블 조회 실패', { error });

    // Supabase 연결 확인
    // 재시도 로직
  }
  throw error;
}
```

---

## 🔍 작동 원리

### DB 스키마 (system_guard)

```sql
CREATE TABLE system_guard (
  id INT PRIMARY KEY,
  kis_token_value TEXT,
  kis_token_expires_at TIMESTAMPTZ,
  kis_token_last_issued_at TIMESTAMPTZ,
  kis_token_issue_count INT DEFAULT 0,
  kis_token_last_error_at TIMESTAMPTZ,
  kis_token_last_error_message TEXT,
  token_cooldown_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 토큰 발급 플로우

```
1. getToken() 호출
   ↓
2. DB에서 system_guard 조회
   ↓
3. 쿨다운 체크
   - token_cooldown_until > now
   - YES → TokenCooldownError 발생
   - NO → 계속
   ↓
4. 토큰 유효성 체크
   - kis_token_expires_at > now
   - YES → 캐시된 토큰 반환
   - NO → 재발급 진행
   ↓
5. KIS API 호출 (/oauth2/tokenP)
   - 성공 → 토큰 DB 저장, 반환
   - 실패 → 에러 기록, 쿨다운 설정, KisTokenError 발생
```

### 쿨다운 메커니즘

```typescript
// 토큰 발급 실패 시
const cooldownUntil = now + 60초;
await db.update({
  kis_token_last_error_at: now,
  kis_token_last_error_message: errorText,
  token_cooldown_until: cooldownUntil,
});

// 다음 getToken() 호출 시
if (now < cooldownUntil) {
  throw new TokenCooldownError(cooldownUntil);
}
```

---

## 💡 베스트 프랙티스

### 1. 싱글톤 패턴 사용

```typescript
// ✅ 좋음: 서비스당 하나의 TokenManager
let tokenManager: TokenManager | null = null;

export function getTokenManager() {
  if (!tokenManager) {
    tokenManager = new TokenManager('my-service');
  }
  return tokenManager;
}

// ❌ 나쁨: 매번 새 인스턴스
async function callApi() {
  const tm = new TokenManager();  // 매번 생성
  const token = await tm.getToken();
}
```

### 2. TokenCooldownError는 스킵

```typescript
// ✅ 좋음: 쿨다운 중이면 배치 스킵
try {
  const token = await tokenManager.getToken();
  await collectData(token);
} catch (error) {
  if (error instanceof TokenCooldownError) {
    logger.warn('쿨다운 중, 배치 스킵');
    return;  // 다음 스케줄까지 대기
  }
  throw error;
}

// ❌ 나쁨: 쿨다운 무시하고 재시도
while (true) {
  try {
    const token = await tokenManager.getToken();
    break;
  } catch (error) {
    // 계속 재시도 → 쿨다운 무의미
  }
}
```

### 3. 토큰 캐싱 활용

```typescript
// ✅ 좋음: 토큰을 재사용
const token = await tokenManager.getToken();
await callApi1(token);
await callApi2(token);
await callApi3(token);

// ❌ 나쁨: 매번 getToken() 호출
await callApi1(await tokenManager.getToken());
await callApi2(await tokenManager.getToken());
await callApi3(await tokenManager.getToken());
```

### 4. 에러 타입별 처리

```typescript
// ✅ 좋음: 에러 타입별 처리
try {
  const token = await tokenManager.getToken();
} catch (error) {
  if (error instanceof TokenCooldownError) {
    // 쿨다운: 스킵
    return;
  }
  if (error instanceof KisTokenError) {
    // 토큰 발급 실패: 로깅 + 알림
    logger.error('토큰 발급 실패', { error });
    await sendAlert(error);
    return;
  }
  // 기타 에러: throw
  throw error;
}

// ❌ 나쁨: 모든 에러를 동일하게 처리
try {
  const token = await tokenManager.getToken();
} catch (error) {
  logger.error('에러', error);  // 타입 구분 없음
}
```

### 5. 로깅에 서비스 이름 포함

```typescript
// ✅ 좋음: 서비스 이름으로 구분 가능
const tokenManager = new TokenManager('kis-collector');

// ❌ 나쁨: 기본값 사용
const tokenManager = new TokenManager();
```

---

## 🔗 관련 문서

- [KIS API 인증](./.claude/skills/external-api-integration/rules/kis-api.md)
- [Error Handling Patterns](./.claude/skills/error-handling-patterns/SKILL.md)
- [Cooldown Handling](./.claude/skills/error-handling-patterns/rules/cooldown-handling.md)

---

**버전:** 1.0.0
**마지막 업데이트:** 2026-02-11
