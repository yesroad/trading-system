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


## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
