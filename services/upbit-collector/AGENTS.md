# Upbit Collector 규칙

## 목적
`upbit-collector`는 코인 시세/캔들 데이터를 수집해 Supabase에 적재한다.

## 명령어
```bash
dev:         yarn dev
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 내부: `@workspace/db-client`, `@workspace/shared-utils`
- 외부: `@supabase/supabase-js`, `big.js`, `zod`, `jsonwebtoken`

## 로컬 규칙
- 수집 루프는 idempotent/stateless 성격을 유지한다.
- 외부 응답은 런타임 검증을 거쳐 저장한다.
- 공통 DB 접근/유틸을 우선 사용하고 직접 구현을 최소화한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
