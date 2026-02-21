# trade-executor

`trade-executor`는 `trading_signals`를 소비해 리스크 검증 후 주문을 실행하고, 결과를 DB(outbox 포함)에 기록하는 서비스다.

## 명령어

```bash
yarn dev
yarn build
yarn check-types
yarn lint
yarn test
```

## 실행 개요

- `TRADE_EXECUTOR_ENABLED=true`일 때만 동작
- `LOOP_MODE=true`면 시장별 루프 실행, `false`면 1회 실행
- 실행 전 공통 가드:
  - `system_guard.trading_enabled=true`
  - `daily_trading_stats` 일일 제한 미초과
- `DRY_RUN=true`면 실제 브로커 주문 전송 없이 검증/기록만 수행

## 시장/시간 가드

- `TRADE_EXECUTOR_RUN_MODE=MARKET_ONLY` (기본)
  - `CRYPTO`: 24시간
  - `KRX`: 평일 KST 09:00~15:30
  - `US`: 평일 ET 09:30~16:00
- `TRADE_EXECUTOR_RUN_MODE=EXTENDED`
  - `KRX`: 평일 KST 08:00~16:00
  - `US`: 평일 ET 04:00~20:00
- `TRADE_EXECUTOR_RUN_MODE=ALWAYS`
  - 장시간 체크 없이 항상 실행
- `ENABLE_MARKET_HOURS_GUARD=false`면 시간 가드 비활성

## 핵심 입력/출력

- 입력:
  - `trading_signals` (`consumed_at IS NULL`, `confidence >= MIN_CONFIDENCE`)
  - `positions`, 시세 테이블(`upbit_candles`, `kis_price_ticks`, `equity_bars`)
  - 최근 `ai_analysis_results`
- 출력:
  - `trade_executions`, `trades`, `daily_trading_stats`
  - `notification_events` (Telegram 직접 전송하지 않고 outbox 적재)

## 주요 환경변수

- 실행: `TRADE_EXECUTOR_ENABLED`, `LOOP_MODE`, `EXECUTE_MARKETS`
- 런모드/가드: `TRADE_EXECUTOR_RUN_MODE`, `ENABLE_MARKET_HOURS_GUARD`
- 전략: `MIN_CONFIDENCE`, `MAX_TRADE_NOTIONAL`, `MAX_DAILY_TRADES`, `STOP_LOSS_PCT`, `TAKE_PROFIT_PCT`
- 보호장치: `AUTO_DISABLE_CONSECUTIVE_FAILURES`, `AUTO_RECOVERY_COOLDOWN_MIN`
- 안전: `DRY_RUN`

## 관련 문서

- 상세 매매 규칙: `services/trade-executor/trading-rules.md`
- 로컬 규칙: `services/trade-executor/AGENTS.md`
