# KIS Auth 규칙

## 목적
`@workspace/kis-auth`는 KIS 토큰 발급/캐시/쿨다운 처리 패키지다.
KIS 연동 서비스는 토큰 로직을 재구현하지 않고 이 패키지를 사용한다.

## 명령어
```bash
dev:         yarn dev
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 내부: `@workspace/shared-utils`
- 외부: `@supabase/supabase-js`, `luxon`, `dotenv`

## 로컬 규칙
- 토큰 로직은 `TokenManager`로 단일화한다.
- 필수 env는 `requireEnv`로 검증한다.
- DB 상태 저장 시 `system_guard` 스키마와 정합성을 유지한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
