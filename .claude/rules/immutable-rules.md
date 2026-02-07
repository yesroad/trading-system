# Trading System - Immutable Rules

이 문서는 **반드시 지켜야 하는 규칙만** 정의한다.
중복 방지를 위해 설명/예시는 최소화하며, 구현 예시는 각 skill 또는 코드에서 확인한다.

## 1) 우선순위
1. 루트/하위 `AGENTS.md`
2. `.claude/rules/immutable-rules.md`
3. `.claude/skills/*`

## 2) 보안
- `.env`, `.env.*`, API 키/토큰/비밀번호, PII는 커밋 금지
- `SUPABASE_KEY`는 시크릿으로 취급하며 로그/코드에 평문 노출 금지
- `mcp.json`, `.claude/mcp.json` 커밋 금지

## 3) 아키텍처
- `services/*` 간 직접 import 금지
- 서비스 간 데이터 공유는 Supabase(DB) 경유
- 공통 로직은 `packages/*`로 이동 후 `@workspace/*`로 참조

## 4) 타입/검증
- 모든 워크스페이스 TypeScript strict 유지
- 명시적 `any` 금지 (`unknown` + 타입가드/스키마 사용)
- 외부 API 응답은 런타임 검증 필수(기본: Zod)

## 5) 환경변수
- 필수 env는 `@workspace/shared-utils`의 `requireEnv`로 조회
- Supabase 키 환경변수명은 `SUPABASE_KEY` 단일 사용

## 6) 숫자/금융 계산
- 가격/수량/금액/수익률 계산은 `big.js` 사용
- count/index/loop/time(ms) 같은 제어값은 `number` 허용

## 7) 날짜/시간
- 신규/변경 코드에서 JS `Date` 직접 사용 금지
- `@workspace/shared-utils` 날짜 유틸(`nowIso`, `normalizeUtcIso`) 또는 Luxon 사용

## 8) DB 접근
- 공통 DB 동작은 `@workspace/db-client` 우선 사용
- 서비스별 특수 쿼리만 `getSupabase()` 직접 사용
