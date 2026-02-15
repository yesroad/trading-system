---
name: common-packages
description: "@workspace/shared-utils, @workspace/db-client, @workspace/kis-auth 사용 패턴을 빠르게 적용할 때 사용"
metadata:
  author: yesroad
  version: 1.1.0
  category: package-usage
---

# Common Packages (Lean)

중복 설명 대신, 패키지별 **권장 진입점**과 **금지 패턴**만 정의한다.

## 1) @workspace/shared-utils
주요 사용:
- env: `env`, `requireEnv`, `envNumber`, `envBoolean`
- date: `nowIso`, `normalizeUtcIso`
- ops: `sleep`, `createBackoff`, `createLogger`

규칙:
- `process.env` 직접 접근 대신 env 유틸 우선
- 신규/변경 코드에 `Date` 직접 사용 금지

## 2) @workspace/db-client
주요 사용:
- `getSupabase()`
- 공통 함수 (예: `upsertWorkerStatus`, `loadCryptoPositions`)

규칙:
- 공통 동작은 db-client 함수 우선
- 서비스 전용 특수 쿼리만 `getSupabase()` 직접 사용
- 모든 쿼리는 `error` 처리 필수

## 3) @workspace/kis-auth
주요 사용:
- `TokenManager`
- 에러: `TokenCooldownError`, `KisTokenError`

규칙:
- KIS 토큰 획득은 패키지 재사용
- 서비스에서 토큰 발급 로직 재구현 금지

## New Service Checklist
1. `package.json`에 필요한 `@workspace/*` 의존성 추가
2. env 읽기 유틸 적용 (`requireEnv`)
3. DB 접근은 `@workspace/db-client`로 시작
4. 금액 계산은 `big.js` 적용
