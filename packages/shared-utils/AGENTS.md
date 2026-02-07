# Shared Utils 규칙

## 목적
`@workspace/shared-utils`는 env/date/logger/backoff/sleep 등 공통 유틸 패키지다.
서비스별 중복 유틸 구현을 줄이고 규칙 일관성을 유지한다.

## 명령어
```bash
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 외부: `luxon`, `dotenv`

## 로컬 규칙
- env 접근은 `env`/`requireEnv`/`envNumber`/`envBoolean`으로 통일한다.
- 날짜/시간 유틸은 Luxon 기반으로 유지한다.
- 서비스 공통 타입(`Nullable` 등)은 여기서 제공한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
