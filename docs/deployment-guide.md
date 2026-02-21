# Trading System 배포 가이드

**기준일:** 2026-02-21
**대상:** 코인 자동매매 (KRW-BTC, Upbit) — 최소 구성 + AI 분석 선택 구성

---

## 1. 시스템 구성 (코인 자동매매 기준)

```
[상시 수집]
upbit-collector  → upbit_candles (KRW-BTC 시세)
yf-collector     → yf_candles (SPY 필터용)
       ↓

[신호 생성]
portfolio-signal (cron, 룰 기반) ┐
ai-analyzer (cron, AI 기반, 선택) ├→ trading_signals DB
                                  ┘
       ↓

[실행]
trade-executor (loop) → Upbit API → trades
       ↓

[모니터링]
monitoring-bot (10분 cron)       → Telegram
monitoring-daily-report (1일 1회) → Telegram
```

### 최소 실행 앱 (코인 기준 6개)

| 서비스                    | 역할               | 실행 방식      |
| ------------------------- | ------------------ | -------------- |
| `upbit-collector`         | BTC 시세 수집      | 24시간 루프    |
| `yf-collector`            | SPY 시세 수집      | 루프 (US 장중) |
| `trade-executor`          | 신호 감지 → 실주문 | 24시간 루프    |
| `portfolio-signal`        | 매매 신호 생성     | cron 30분      |
| `monitoring-bot`          | 상태 알림          | cron 10분 간격 |
| `monitoring-daily-report` | 일일 요약          | cron 1일 1회   |

### 선택 실행 앱

| 서비스            | 역할                   | 실행 방식 |
| ----------------- | ---------------------- | --------- |
| `ai-analyzer`     | AI 기반 신호 생성      | cron 30분 |
| `market-calendar` | 이벤트/실적 수집       | 내부 주기 |
| `kis-collector`   | KRX 수집(국장 운영 시) | 장중 루프 |

### 시간 정책

- 시스템 내부 시간 기준: UTC 고정
- 사용자 표시(텔레그램/리포트): KST 변환 표기
- DB timestamp 저장은 UTC 유지

---

## 2. 배포 프로세스 (PM2 기준)

### 2-1. 사전 준비

```bash
# Node.js 22+ 설치 확인
node --version   # v22.x 이상

# PM2 전역 설치
npm install -g pm2

# 리포지토리 클론 (서버에서)
git clone [repo-url] ~/trading-system
cd ~/trading-system
```

### 2-2. 의존성 설치 및 빌드

```bash
# 전체 빌드 (Turborepo)
yarn install
yarn build

# 빌드 결과 확인
ls services/upbit-collector/dist/index.js
ls services/trade-executor/dist/index.js
ls services/backtest-engine/dist/cli.js
```

### 2-3. 환경변수 설정

각 서비스 디렉토리에 `.env` 파일 생성:

**`services/upbit-collector/.env`**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
UPBIT_ACCESS_KEY=your_upbit_access_key
UPBIT_SECRET_KEY=your_upbit_secret_key
# BTC만 수집 (트래픽/DB 절약)
UPBIT_TOP_N=1
```

**`services/yf-collector/.env`**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
# SPY만 수집
YF_RUN_MODE=MARKET
```

**`services/trade-executor/.env`**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
UPBIT_ACCESS_KEY=your_upbit_access_key
UPBIT_SECRET_KEY=your_upbit_secret_key
DRY_RUN=false
LOOP_MODE=true
EXECUTE_MARKETS=CRYPTO
TRADE_EXECUTOR_RUN_MODE=NO_CHECK
MAX_TRADE_NOTIONAL=300000
MAX_DAILY_TRADES=3
```

**`services/monitoring-bot/.env`**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
DAILY_REPORT_ENABLED=true
AI_MONTHLY_BUDGET_USD=15
AI_DAILY_LIMIT=50
AI_DAILY_LIMIT_CRYPTO=20
AI_DAILY_LIMIT_KRX=10
AI_DAILY_LIMIT_US=0
AI_ESTIMATED_COST_PER_CALL_USD=0.0075
```

**`services/ai-analyzer/.env` (선택)**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
OPENAI_API_KEY=your_openai_key
AI_MODEL=gpt-5-mini
AI_LLM_TEMPERATURE=0.35
AI_HOLD_RETRY_ENABLED=true
AI_HOLD_RETRY_THRESHOLD=0.9
AI_HOLD_RETRY_TEMPERATURE=0.45
AI_DAILY_LIMIT=50
AI_DAILY_LIMIT_CRYPTO=20
AI_DAILY_LIMIT_KRX=10
AI_DAILY_LIMIT_US=0
AI_TECHNICAL_ENRICH_LIMIT=12
```

**`services/backtest-engine/.env`**

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
```

### 2-4. Supabase 설정

```sql
-- system_guard 거래 활성화
UPDATE system_guard SET trading_enabled = true WHERE id = 'default';
```

### 2-5. PM2 실행

```bash
cd ~/trading-system

# 전체 서비스 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 서버 재시작 시 자동 실행 등록
pm2 save
pm2 startup   # 출력된 명령어 복사 후 실행
```

### 2-6. 정상 동작 확인

```bash
# 실시간 로그 확인
pm2 logs upbit-collector   # 시세 수집 확인
pm2 logs trade-executor    # 신호 감지 로그
pm2 logs portfolio-signal  # 신호 생성 결과
pm2 logs monitoring-daily-report # 데일리 리포트 전송 로그

# AI 기반 신호도 사용할 경우
pm2 logs ai-analyzer

# 수동으로 신호 생성 테스트 (dry-run)
cd services/backtest-engine
node dist/cli.js portfolio-signal \
  --symbols "KRW-BTC" \
  --crypto-strategy bb-squeeze \
  --spy-filter --symbol-ma-filter \
  --dry-run
```

---

## 3. 운영 체크리스트

### 일일

```
□ pm2 status — 최소 구성 앱(6개) online
□ Telegram 알림 정상 수신 확인
□ /tmp/portfolio-signal.log 에러 없음
```

### 주간

```
□ pm2 logs 에러 패턴 확인
□ Supabase 대시보드 — DB 사용량 확인
□ trades 테이블 — 실주문 내역 확인
□ Upbit 앱 — 실제 체결 내역 일치 확인
```

### 월간

```
□ 수익률 측정 (portfolio-signal 실행 후 비교)
□ 결과 보고 후 투자 금액 조정 결정
□ 전략 파라미터 점검 (3개월마다)
```

---

## 4. 문제 발생 시 긴급 중단

```bash
# 전체 중단 (주문 즉시 중단)
pm2 stop trade-executor

# 또는 Supabase에서 전역 차단
# SQL: UPDATE system_guard SET trading_enabled = false WHERE id = 'default';

# 진행 중 포지션 확인 (필요시 앱/거래소에서 수동 청산)
```
