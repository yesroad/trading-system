# Trade Executor 매매 룰 (Codebase 기준)

이 문서는 현재 `services/trade-executor` 코드에 구현된 실제 매매 규칙을 정리한다.

## 1. 실행 전제

- `TRADE_EXECUTOR_ENABLED=true`일 때만 실행
- `LOOP_MODE=false`면 1회 실행, `true`면 시장별 주기 루프
- 공통 가드 통과가 선행 조건
  - `system_guard` 허용 상태
  - `daily_trading_stats` 일일 거래 횟수 제한 미초과

## 2. 시장별 실행 조건

- `ENABLE_MARKET_HOURS_GUARD=false`면 장시간 가드 비활성화(항상 실행)
- `TRADE_EXECUTOR_RUN_MODE=ALWAYS`면 시장 공통 24시간 실행
- `TRADE_EXECUTOR_RUN_MODE=MARKET_ONLY`(기본)
  - `CRYPTO`: 24시간
  - `KRX`: 평일 KST 09:00~15:30
  - `US`: 평일 ET 09:30~16:00
- `TRADE_EXECUTOR_RUN_MODE=EXTENDED`
  - `CRYPTO`: 24시간
  - `KRX`: 평일 KST 08:00~16:00
  - `US`: 평일 ET 04:00~20:00
- 장시간 외에는 해당 시장 루프 스킵

## 3. 데이터 입력

- AI 분석: `ai_analysis_results`
  - 최근 데이터(`created_at` 기준, 기본 180분)
  - `market` 필터
- 포지션: `positions`
  - `CRYPTO`: `loadPositions` 재사용(UPBIT)
  - `KR/US`: `positions` 직접 조회
- 현재가:
  - `CRYPTO`: `upbit_candles` 최신 `close`
  - `KR`: `kis_price_ticks` 최신 `price`
  - `US`: `equity_bars` 최신 `close`

## 4. 후보 선정 규칙 (`pickCandidates`)

기본 분기:
- `confidence < MIN_CONFIDENCE` -> `SKIP`
- `BLOCK` + 보유 포지션 있음 -> `SELL`
- `ALLOW` + 미보유 -> `BUY`
- 그 외 -> `SKIP`

정렬:
- 실행 가능(`BUY/SELL`) 우선
- 이후 confidence 내림차순

## 5. 최종 매매 룰 (`applyTradingRules`)

### 매수
- `ALLOW` 이고 `confidence >= 0.7` 이고 미보유일 때 `BUY`

### 매도
- `BLOCK` + 보유 포지션 -> `SELL`
- 손절: 수익률 `<= -5%` -> `SELL`
- 익절: 수익률 `>= +10%` -> `SELL`

수익률 계산식:
- `(currentPrice - avgPrice) / avgPrice`
- `big.js` 사용

### 보류
- 위 조건에 해당하지 않으면 `SKIP`

## 6. 주문 수량 산정 (`executeOrders`)

- 기준 금액: `MAX_TRADE_NOTIONAL`
- KIS: 정수 수량(내림), 최소 1주
- UPBIT: 소수 수량(최소 0.00000001)
- 현재가 미확보 시 주문 금지(`SKIP`)
- 이 경우 `trade_executions` 생성/브로커 주문 호출 없이 `notification_events`만 적재

## 7. 주문 실행

- 브로커 매핑
  - `KR/US` -> `KISClient`
  - `CRYPTO` -> `UpbitClient`
- 주문 타입: 현재 `MARKET` 고정
- `DRY_RUN=true`면 브로커 실제 주문 전송 없이 스킵 처리
- 수수료/세금 기록은 브로커 응답 기반
  - 매매 경로와 분리된 별도 정산 워커가 후처리로 비용 확정
  - `UPBIT`: 주문/체결 조회 응답의 `paid_fee` 기반 저장
  - `KIS`: `order-cash`, `inquire-daily-ccld` 응답에 수수료/세금 필드가 없어 `UNAVAILABLE` 처리(0 저장)

## 8. DB 기록

### trade_executions
- 주문 시도 전 `PENDING` insert
- 실행 결과에 따라 `SUCCESS`/`FAILED` update
- `idempotency_key` 사용
  - 키: `broker:market:symbol:action:aiAnalysisId`
  - 중복 충돌 시 기존 row 재사용

### daily_trading_stats
- 실행 결과마다 통계 업데이트
- 우선 RPC `increment_daily_stats` 호출
- 실패 시 직접 upsert fallback

### trades 비용 기록
- `fee_amount`, `tax_amount` 컬럼이 존재하면 별도 컬럼에 저장
- 컬럼이 없으면 `metadata.costs`에 fallback 저장
- `metadata.costs.source`로 원천 구분 (`BROKER` | `UNAVAILABLE`)
- 일일 P&L/Outcome 계산 시 수수료/세금을 차감한 순손익(net) 기준 사용

## 9. system_guard 상태 전이

- 주문 실패/예외 누적 시 `error_count` 증가
- 임계치(`AUTO_DISABLE_CONSECUTIVE_FAILURES`, 기본 3) 도달 시 자동 비활성화
- `cooldown_until` 설정 (`AUTO_RECOVERY_COOLDOWN_MIN`, 기본 10분)
- 성공 시 `error_count` 리셋
- 자동 복구
  - 비활성 상태 + 쿨다운 만료 시 재활성화
  - 단, `reason`에 `manual` 포함 시 자동 복구하지 않음

## 10. 알림 룰 (`notification_events`)

trade-executor는 Telegram 직접 전송하지 않고 outbox에 적재:
- `TRADE_FILLED` (체결 성공)
- `TRADE_FAILED` (주문 실패)
- `TRADE_EXECUTION_ERROR` (실행 예외)
- `PRICE_MISSING_SKIP` (현재가 미확보로 스킵)
- `GUARD_BLOCKED` (가드 차단)
- `GUARD_RECOVERED` (자동 복구)

`monitoring-bot`이 `notification_events(status='PENDING')`를 폴링해 Telegram 전송 후 상태를 갱신한다.

## 11. 사용 환경변수 (핵심)

- 실행: `TRADE_EXECUTOR_ENABLED`, `LOOP_MODE`, `EXECUTE_MARKETS`
- 런모드: `TRADE_EXECUTOR_RUN_MODE` (`MARKET_ONLY` | `EXTENDED` | `ALWAYS`)
- 주기: `LOOP_INTERVAL_CRYPTO_SEC`, `LOOP_INTERVAL_US_SEC`, `LOOP_INTERVAL_KR_SEC`
- 전략: `MIN_CONFIDENCE`, `STOP_LOSS_PCT`, `TAKE_PROFIT_PCT`, `MAX_TRADE_NOTIONAL`, `MAX_DAILY_TRADES`
- 가드: `ENABLE_MARKET_HOURS_GUARD`, `AUTO_DISABLE_CONSECUTIVE_FAILURES`, `AUTO_RECOVERY_COOLDOWN_MIN`
- 안전: `DRY_RUN`
- 비용정산: `COST_RECONCILE_ENABLED`, `COST_RECONCILE_INTERVAL_SEC`, `COST_RECONCILE_LOOKBACK_DAYS`, `COST_RECONCILE_BATCH_SIZE`, `COST_RECONCILE_UPBIT_POLL_MAX`, `COST_RECONCILE_UPBIT_POLL_MS`
