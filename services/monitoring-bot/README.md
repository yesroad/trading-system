# monitoring-bot

모니터링 워커 상태/수집 상태/AI/거래 이상을 점검하고,  
Telegram 알림과 `notification_events` outbox 소비를 담당한다.

## 명령어
```bash
yarn dev
yarn build
yarn check-types
yarn lint
```

## 실행 방식
- PM2 기준 `monitoring-bot`는 `cron_restart: */10 * * * *`로 10분 주기 실행
- `monitoring-daily-report`는 `--daily-report`로 일 1회 실행 (09:10 KST)

## 내부 알림 정책
- 내부 체크 결과는 `CRIT`만 Telegram 전송
- `WARN`/`INFO` 내부 알림은 전송하지 않음
- 동일 키 알림은 `ALERT_COOLDOWN_MIN` 동안 재전송 차단

## 내부 CRIT 점검 항목
- 워커 없음/지연/정상 기록 없음 (`worker_status`)
- 수집 파이프라인 missing/running 지연/stale (`ingestion_runs`)
- 미소비 신호 장기 적체 (`trading_signals`) 단, 아래 조건 모두 충족 시:
  - `system_guard.trading_enabled=true`
  - `trade-executor` 최근 동작 기록 존재
  - 해당 신호 시장이 `EXECUTE_MARKETS`에 포함
  - 해당 시장 장중 상태
- 최근 10분 내 `circuit_breaker` (`risk_events`)
- 최근 1시간 거래 실패율 CRIT (`trades`)
- 최근 24시간 신호 생성 실패율 CRIT (`signal_failures`)
- 체크 함수 실행 실패/DB 조회 실패

## AI 예산 CRIT 알림
- 시간 한도 도달: `AI_HOURLY_LIMIT`
- 일 한도 도달: `AI_DAILY_LIMIT`
- 월 예산 80% 도달: `AI_MONTHLY_BUDGET_USD * 0.8`
- 월 예산 100% 도달: `AI_MONTHLY_BUDGET_USD`

## 외부 outbox(`notification_events`) 정책
- 외부 이벤트는 내부 CRIT 필터와 별도로 처리
- `level=ERROR`는 항상 전송
- 또는 `event_type`이 아래면 전송:
  - `TRADE_FILLED`, `BUY_FILLED`, `SELL_FILLED`
  - `TRADE_FAILED`, `TRADE_EXECUTION_ERROR`
  - `CIRCUIT_BREAKER`, `LIQUIDATION`
- 그 외 이벤트는 미전송 처리 후 상태 정리
