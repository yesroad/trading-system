# Monitoring Bot 규칙

## 목적
`monitoring-bot`은 워커 상태/지연/이상 상태를 점검하고 `notification_events`를 Telegram으로 전송한다.

## 명령어
```bash
dev:         yarn dev
start:       yarn start
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택
- 내부: `@workspace/shared-utils`
- 외부: `@supabase/supabase-js`, `dotenv`

## 로컬 규칙
- 알림 발송은 `notification_events` outbox 소비 기준을 유지한다.
- 점검 로직은 fail-open/fail-safe 기준을 명확히 하고 로그를 남긴다.
- 시간 계산은 Luxon/공통 유틸을 사용한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.

## 알림 정책 (코드 기준)
- 내부 체크 알림은 `CRIT`만 Telegram 전송한다.
- 동일 알림키는 `ALERT_COOLDOWN_MIN` 내 중복 전송하지 않는다.
- `safeRunCheck` 실패도 `CRIT`로 승격해 전송한다.
- `ai_missing`, `ai_stale` 계열 알림은 전송하지 않는다.

## AI 예산 알림 규칙
- `AI_HOURLY_LIMIT` 도달 시 `ai_budget_hourly_limit`(CRIT)
- 시장별 일 한도(`AI_DAILY_LIMIT_CRYPTO`, `AI_DAILY_LIMIT_KRX`, `AI_DAILY_LIMIT_US`) 도달 시 `ai_budget_daily_limit`(CRIT)
- `AI_DAILY_LIMIT`는 시장별 키 미지정 시 fallback(공통 기준값)
- 일 한도 알림은 도달한 시장 단위로 개별 전송
- 월 비용이 `AI_MONTHLY_BUDGET_USD`의 80% 이상이면 `ai_budget_monthly_80`(CRIT)
- 월 비용이 `AI_MONTHLY_BUDGET_USD` 이상이면 `ai_budget_monthly_limit`(CRIT)

## notification_events 전송 필터
- `level=ERROR`는 항상 Telegram 전송
- `INFO/WARNING`은 이벤트 타입 화이트리스트만 전송:
  - `TRADE_FILLED`, `BUY_FILLED`, `SELL_FILLED`
  - `TRADE_FAILED`, `TRADE_EXECUTION_ERROR`
  - `CIRCUIT_BREAKER`, `LIQUIDATION`

## trading_signals 적체 CRIT 조건
- `consumed_at IS NULL` 신호가 60분 이상 적체
- `system_guard.trading_enabled=true`
- `trade-executor` 최근 동작 기록 존재
- 신호의 시장이 `EXECUTE_MARKETS`에 포함
- 신호의 시장이 장중 상태


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
