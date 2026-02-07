# DB Client 규칙

## 목적
`@workspace/db-client`는 Supabase 공통 접근 레이어다.
서비스들이 중복 쿼리/클라이언트 코드를 재작성하지 않도록 공통 함수를 제공한다.

## 명령어
```bash
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 내부: `@workspace/shared-utils`
- 외부: `@supabase/supabase-js`

## 로컬 규칙
- 공통 DB 동작은 이 패키지에 먼저 추가하고 서비스에서 재사용한다.
- 각 함수는 `error` 처리를 누락하지 않는다.
- 숫자/시간/env 처리는 루트 규칙 및 `@workspace/shared-utils`를 따른다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
