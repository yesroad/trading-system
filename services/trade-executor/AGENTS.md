# Trade Executor 규칙

## 목적
`trade-executor`는 AI 분석/포지션/가드를 기반으로 매매 결정을 수행하고 주문 실행 결과를 DB에 기록한다.

## 명령어
```bash
dev:         yarn dev
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 내부: `@workspace/db-client`, `@workspace/kis-auth`, `@workspace/shared-utils`
- 외부: `@supabase/supabase-js`, `big.js`, `zod`, `luxon`

## 로컬 규칙
- 매매 규칙은 `trading-rules.md`와 코드 동작을 항상 동기화한다.
- `DRY_RUN`, `system_guard`, `daily_trading_stats` 가드를 우회하지 않는다.
- 가격/수량/수익률 계산은 `big.js`를 사용한다.
- 알림은 직접 전송하지 않고 `notification_events`에 적재한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
