# Trading System 배포 가이드

**기준일:** 2026-02-20
**대상:** 코인 자동매매 (KRW-BTC, Upbit) — 최소 구성

---

## 1. 시스템 구성 (코인 자동매매 기준)

```
[매일 08:00 KST]                 [24시간 상시]
portfolio-signal (cron)   →   trading_signals DB
  KRW-BTC bb-squeeze            ↓
  SPY MA200 필터          trade-executor (loop)
  Symbol MA50 필터              ↓
                           Upbit API → 실주문
                                ↓
[10분 간격]               trades DB → monitoring-bot
monitoring-bot (cron)           ↓
  시스템 상태 체크         Telegram 알림
  Telegram 알림

[상시 수집]
upbit-collector → upbit_candles (KRW-BTC 시세)
yf-collector    → yf_candles (SPY 시세, MA200 필터용)
```

### 실행 필요 서비스 (5개)

| 서비스 | 역할 | 실행 방식 |
|--------|------|---------|
| `upbit-collector` | BTC 시세 수집 | 24시간 루프 |
| `yf-collector` | SPY 시세 수집 | 루프 (US 장중) |
| `trade-executor` | 신호 감지 → 실주문 | 24시간 루프 |
| `portfolio-signal` | 매매 신호 생성 | cron 1일 1회 |
| `monitoring-bot` | 상태 알림 | cron 10분 간격 |

---

## 2. 배포 옵션별 비용 비교

### 2-1. 옵션 A: Mac 로컬 (현재)

| 항목 | 비용 |
|------|------|
| 서버 | 0원 |
| Supabase Free | 0원 |
| Upbit API | 0원 |
| Telegram Bot | 0원 |
| **합계** | **0원/월** |

**단점:**
- Mac 꺼지면 자동매매 중단
- 수면/외출 중 모니터 불가능
- 전기세 추가 (약 2,000~3,000원/월)

---

### 2-2. 옵션 B: Oracle Cloud Free Tier ⭐ 추천 (무료)

| 항목 | 사양 | 비용 |
|------|------|------|
| Ampere A1 (ARM) | 4 vCPU / 24GB RAM / 200GB SSD | **0원** |
| Supabase Free | 500MB DB / 5GB bandwidth | 0원 |
| Upbit API | — | 0원 |
| Telegram Bot | — | 0원 |
| **합계** | | **0원/월** |

**장점:** 무료 + 24시간 안정 운영
**단점:** 초기 설정 복잡 (Oracle 계정 신용카드 필요, 삭제 안 됨 주의)

---

### 2-3. 옵션 C: AWS Lightsail / DigitalOcean (유료 최소)

| 항목 | 사양 | 비용 |
|------|------|------|
| Lightsail $5 플랜 | 1 vCPU / 1GB RAM / 40GB SSD | **$5/월 (~7,400원)** |
| 또는 DigitalOcean | 1 vCPU / 1GB RAM / 25GB SSD | $6/월 (~8,900원) |
| Supabase Free | 500MB DB | 0원 |
| **합계** | | **7,400~8,900원/월** |

**장점:** 설정 쉬움, 안정적, 지원 좋음
**단점:** 월 비용 발생

---

### 2-4. 비용 확장 시나리오 (미장 추가 시)

| 단계 | 추가 항목 | 추가 비용 |
|------|---------|---------|
| 코인만 | — | 0원 |
| + 국장 추가 | kis-collector 추가 실행 | 0원 (서버 동일) |
| + 미장 추가 | yf-collector 이미 실행 중 | 0원 |
| Supabase 한도 초과 시 | Pro ($25/월, 37,000원) | +37,000원/월 |

> **Supabase 무료 한도 계산**
> KRW-BTC 1분봉: 1,440캔들/일 × 200 bytes ≈ 8.6MB/월
> SPY 15분봉: ~26캔들/일 × 200 bytes ≈ 0.2MB/월
> **예상 소진 기간: 약 55개월 (4년 이상)** → Free Tier 충분

---

## 3. 배포 프로세스 (PM2 기준)

### 3-1. 사전 준비

```bash
# Node.js 22+ 설치 확인
node --version   # v22.x 이상

# PM2 전역 설치
npm install -g pm2

# 리포지토리 클론 (서버에서)
git clone [repo-url] ~/trading-system
cd ~/trading-system
```

### 3-2. 의존성 설치 및 빌드

```bash
# 전체 빌드 (Turborepo)
yarn install
yarn build

# 빌드 결과 확인
ls services/upbit-collector/dist/index.js
ls services/trade-executor/dist/index.js
ls services/backtest-engine/dist/cli.js
```

### 3-3. 환경변수 설정

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
```

**`services/backtest-engine/.env`**
```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your_supabase_key
```

### 3-4. Supabase 설정

```sql
-- system_guard 거래 활성화
UPDATE system_guard SET trading_enabled = true WHERE id = 'default';
```

### 3-5. PM2 실행

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

### 3-6. 정상 동작 확인

```bash
# 실시간 로그 확인
pm2 logs upbit-collector   # 시세 수집 확인
pm2 logs trade-executor    # 신호 감지 로그
pm2 logs portfolio-signal  # 신호 생성 결과

# 수동으로 신호 생성 테스트 (dry-run)
cd services/backtest-engine
node dist/cli.js portfolio-signal \
  --symbols "KRW-BTC" \
  --crypto-strategy bb-squeeze \
  --spy-filter --symbol-ma-filter \
  --dry-run
```

---

## 4. 운영 체크리스트

### 일일
```
□ pm2 status — 5개 서비스 모두 online
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

## 5. 문제 발생 시 긴급 중단

```bash
# 전체 중단 (주문 즉시 중단)
pm2 stop trade-executor

# 또는 Supabase에서 전역 차단
# SQL: UPDATE system_guard SET trading_enabled = false WHERE id = 'default';

# 진행 중 포지션 확인
# Upbit 앱에서 직접 확인 → 필요시 수동 청산
```

---

## 6. 추천 배포 경로

```
지금 (테스트) → Mac 로컬 + PM2
    ↓ 1~2개월 후 안정 확인
Oracle Cloud Free (무료 서버 이전)
    ↓ 수익 발생 후
투자금 증액 + 미장/국장 추가
    ↓ 월 100만원+ 운용 시
Lightsail $10~20 (더 큰 인스턴스)
```
