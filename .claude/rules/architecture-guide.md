# Trading System - 아키텍처 가이드

이 문서는 trading-system 모노레포의 상세 아키텍처 설계 원칙과 패턴을 설명합니다.

## 1. 전체 시스템 아키텍처

### 1.1 계층 구조

```
┌─────────────────────────────────────────────────────────────┐
│                    사용자 인터페이스                          │
│                    apps/web (Next.js)                        │
└────────────────────────┬────────────────────────────────────┘
                         │ (HTTP/WebSocket)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   중앙 데이터 저장소                          │
│              Supabase (PostgreSQL + Auth)                    │
│                                                              │
│  Tables:                                                    │
│  - positions, account_cash (자산)                           │
│  - upbit_candles, kis_candles, yf_candles (시세)          │
│  - ai_analysis, ai_decisions (AI 신호)                    │
│  - trades (거래 기록)                                      │
│  - ingestion_runs, worker_status (운영)                   │
│  - system_guard (시스템 가드, KIS 토큰)                    │
│  - notification_events (알림)                              │
└─────────────────────────────────────────────────────────────┘
         ▲         ▲        ▲         ▲        ▲        ▲
         │         │        │         │        │        │
    ┌────┴──┐  ┌───┴───┐  ┌┴───┐   ┌┴──┐   ┌─┴──┐   ┌┴─────┐
    │Upbit  │  │  KIS  │  │ YF │   │ AI │   │Trade│  │Monitor│
    │Collect│  │Collect│  │Col │   │Anlz│   │Exec │  │ Bot   │
    └───────┘  └───────┘  └────┘   └────┘   └────┘  └───────┘
```

### 1.2 설계 원칙

#### 원칙 1: 느슨한 결합 (Loose Coupling)
- **서비스 간 직접 import 금지**
- 모든 통신은 Supabase를 경유
- 각 서비스는 독립적으로 배포 가능

```typescript
// ❌ 금지: 직접 import
import { fetchPrice } from '../kis-collector/api';

// ✅ 권장: DB 경유
const { data } = await getSupabase()
  .from('kis_candles')
  .select('close')
  .eq('symbol', 'AAPL')
  .order('candle_time', { ascending: false })
  .limit(1)
  .single();
```

#### 원칙 2: 공유 로직의 중앙화
- 공통 유틸리티는 `@workspace/shared-utils`
- DB 접근은 `@workspace/db-client`
- KIS 인증은 `@workspace/kis-auth`

#### 원칙 3: 타입 안전 + 런타임 검증
- TypeScript strict mode 강제
- 외부 API 응답은 Zod로 검증
- 명시적 `any` 금지

#### 원칙 4: 단방향 데이터 흐름
```
데이터 수집 (Collectors)
        ↓
   데이터 저장 (Supabase)
        ↓
   데이터 분석 (AI Analyzer)
        ↓
  의사결정 저장 (Supabase)
        ↓
   주문 실행 (Trade Executor)
        ↓
   거래 기록 (Supabase)
        ↓
   모니터링 (Monitoring Bot)
```

## 2. 서비스별 아키텍처

### 2.1 Collectors (데이터 수집 서비스)

#### 공통 패턴

```typescript
// 1. 환경 설정 로드
const API_KEY = requireEnv('API_KEY');
const logger = createLogger('service-name');

// 2. 메인 루프
async function mainLoop() {
  while (true) {
    try {
      // 3. 데이터 수집 대상 선정
      const targets = await selectTargets();

      // 4. 배치 시작 기록
      const runId = await insertIngestionRun({
        source: 'service-name',
        target_count: targets.length,
      });

      // 5. 각 타겟 처리
      for (const target of targets) {
        try {
          const data = await fetchData(target);
          await saveData(data);
        } catch (error) {
          logger.error('데이터 수집 실패', { target, error });
        }
      }

      // 6. 배치 완료 기록
      await finishIngestionRun(runId, {
        success_count: successCount,
        error_count: errorCount,
      });

      // 7. 워커 상태 업데이트
      await upsertWorkerStatus({
        worker_id: 'service-name',
        last_run_at: nowIso(),
        status: 'ok',
      });

    } catch (error) {
      logger.error('루프 실패', error);
    }

    // 8. 대기
    await sleep(LOOP_INTERVAL_MS);
  }
}
```

#### Upbit Collector 아키텍처

```
┌─────────────────────────────────────┐
│        Main Loop (10초 간격)         │
├─────────────────────────────────────┤
│ 1. 전체 KRW 마켓 조회 (캐싱 60초)   │
│    - fetchAllMarkets()              │
│                                     │
│ 2. 우선순위 기반 타겟 선정          │
│    Priority 1: 보유 자산            │
│    Priority 2: DB 등록 종목         │
│    Priority 3: 거래량 상위          │
│                                     │
│ 3. 각 타겟의 1분봉 수집 (배치)      │
│    - fetchMinuteCandles()           │
│                                     │
│ 4. Supabase 저장                    │
│    - upsertUpbitCandles()           │
│                                     │
│ 5. KRW 잔액 조회 (JWT 서명)         │
│    - fetchKRWBalance()              │
│    - upsertAccountCash()            │
└─────────────────────────────────────┘
```

#### KIS Collector 아키텍처

```
┌────────────────────────────────────────┐
│   Tick-based Scheduler (200ms tick)    │
├────────────────────────────────────────┤
│ 1. 심볼 목록 리프레시 (10초마다)        │
│    - loadActiveKisKrxSymbols()         │
│                                        │
│ 2. 심볼별 폴링 스케줄러                │
│    - 각 심볼마다 lastRunAt 추적        │
│    - Backoff 기반 간격 조정            │
│                                        │
│ 3. 장시간 체크                         │
│    - RUN_MODE: MARKET/PREMARKET/etc   │
│    - 주말/휴장일 스킵                  │
│                                        │
│ 4. TokenCooldownError 처리             │
│    - 쿨다운 중이면 대기                │
│                                        │
│ 5. 데이터 수집 및 저장                 │
│    - fetchKrxPrice()                   │
│    - insertTick()                      │
└────────────────────────────────────────┘
```

### 2.2 AI Analyzer 아키텍처

**핵심 철학: AI 호출 최소화**

```
┌─────────────────────────────────────┐
│  Market별 분석 (크론/스케줄러 호출)  │
├─────────────────────────────────────┤
│ 1. 시장 모드 판단                    │
│    - PRE_OPEN, INTRADAY, CLOSE, etc │
│                                     │
│ 2. 분석 대상 자동 선정              │
│    - 가격 변화율 큰 종목            │
│    - 최근 분석 부족 종목            │
│                                     │
│ 3. AI 호출 필요성 판단              │
│    - shouldCallAIBySnapshot()       │
│    - 데이터 변화 없으면 SKIP        │
│                                     │
│ 4. 쿨다운 + 예산 체크               │
│    - 심볼별 호출 빈도 제한          │
│    - 월별 총 호출 횟수 제한         │
│                                     │
│ 5. LLM 호출 (OpenAI)                │
│    - buildPrompt()                  │
│    - callLLM()                      │
│    - parseResult() + Zod 검증      │
│                                     │
│ 6. 결과 저장                        │
│    - saveAiResults()                │
│    - ai_analysis 테이블             │
└─────────────────────────────────────┘
```

**마켓 모드:**

| 모드 | 시간 | 의미 |
|------|------|------|
| PRE_OPEN | 장 시작 30분 전 | 리스크 체크 |
| INTRADAY | 장중 | 실시간 판단 |
| CLOSE | 장 마감 10분 전 | 포지션 정리 |
| POST_CLOSE | 장 마감 후 1시간 | 일일 요약 |
| CRYPTO | 코인 장중 | 실시간 |
| CRYPTO_DAILY | 매일 1회 | 요약 |
| OFF | - | 비활성 |

### 2.3 Trade Executor 아키텍처

```
┌────────────────────────────────────────┐
│   Market별 Loop (지속 실행)            │
├────────────────────────────────────────┤
│ 1. 가드 체크                           │
│    - 시장 개장 시간                    │
│    - 전역 거래 활성화 상태             │
│    - 예산/리스크 제한                  │
│                                        │
│ 2. 후보 선정                           │
│    - 최근 AI 분석 결과 조회           │
│    - 신호 강도(confidence) 필터링     │
│                                        │
│ 3. 매매 규칙 적용                     │
│    - 포지션 여부 확인                 │
│    - 매수/매도 신호 판단              │
│    - 주문 크기 계산                   │
│                                        │
│ 4. 최종 의사결정                      │
│    - Trade Decision 생성              │
│    - Dry-run 모드 지원                │
│                                        │
│ 5. 주문 실행                          │
│    - Broker 클라이언트 선택           │
│    - 시장가/지정가 주문              │
│    - 결과 기록                        │
│                                        │
│ 6. 알림 발행                          │
│    - notification_events 생성         │
└────────────────────────────────────────┘
```

### 2.4 Monitoring Bot 아키텍처

```
┌──────────────────────────────────┐
│   Monitoring Loop (주기적 실행)   │
├──────────────────────────────────┤
│ 1. 워커 상태 확인                 │
│    - worker_status 조회           │
│    - 최근 실행 시간 체크          │
│                                   │
│ 2. 데이터 수집 현황               │
│    - ingestion_runs 집계          │
│    - 에러율 계산                  │
│                                   │
│ 3. AI 분석 현황                   │
│    - ai_analysis 집계             │
│    - 신호 분포 확인               │
│                                   │
│ 4. 거래 현황                      │
│    - trades 조회                  │
│    - 성공/실패 집계               │
│                                   │
│ 5. 알림 발송                      │
│    - notification_events 조회     │
│    - Telegram 전송                │
│    - 쿨다운 적용                  │
│                                   │
│ 6. 일일/주간 리포트               │
│    - 정기 리포트 생성             │
└──────────────────────────────────┘
```

## 3. 공유 라이브러리 아키텍처

### 3.1 @workspace/shared-utils

**책임:** 모든 서비스의 기초 유틸리티

**모듈 구조:**
```
shared-utils/
├── src/
│   ├── env.ts          # 환경변수 접근
│   ├── date.ts         # Luxon 기반 날짜 유틸
│   ├── logger.ts       # 구조화된 로깅
│   ├── backoff.ts      # 지수 백오프 + 지터
│   └── types.ts        # 공용 타입
└── package.json
```

**의존성 정책:**
- 최소한의 외부 의존성 (dotenv, luxon만)
- 다른 workspace 패키지 의존 금지
- Node.js 내장 모듈 우선 사용

### 3.2 @workspace/db-client

**책임:** Supabase 접근 레이어

**모듈 구조:**
```
db-client/
├── src/
│   ├── client.ts           # Supabase 싱글톤
│   ├── positions.ts        # 포지션 조회
│   ├── worker-status.ts    # 워커 상태 관리
│   ├── account-cash.ts     # 계좌 현금 관리
│   ├── ingestion-runs.ts   # 수집 배치 추적
│   └── types.ts            # DB 타입 정의
└── package.json
```

**설계 원칙:**
- 공통 쿼리만 함수로 제공
- 서비스 특수 쿼리는 `getSupabase()` 직접 사용
- 모든 쿼리에서 에러 처리 필수
- 타입 안전성 보장 (타입 가드)

### 3.3 @workspace/kis-auth

**책임:** KIS API 토큰 생명주기 관리

**아키텍처:**
```
┌─────────────────────────────────────┐
│         TokenManager                │
├─────────────────────────────────────┤
│ getToken()                          │
│   ↓                                 │
│   1. DB에서 현재 토큰 조회          │
│      (system_guard 테이블)          │
│   ↓                                 │
│   2. 쿨다운 체크                    │
│      (TokenCooldownError)           │
│   ↓                                 │
│   3. 토큰 유효성 확인               │
│      (30초 버퍼 조기 갱신)          │
│   ↓                                 │
│   4. 만료 시 신규 발급              │
│      (KIS API 호출)                 │
│   ↓                                 │
│   5. DB에 저장                      │
│      (updateTokenInDB)              │
│   ↓                                 │
│   6. 토큰 반환                      │
└─────────────────────────────────────┘
```

**쿨다운 메커니즘:**
- 토큰 발급 실패 시 60초 쿨다운
- `token_cooldown_until` 컬럼에 기록
- 쿨다운 중 호출 시 `TokenCooldownError` throw

## 4. 데이터 모델

### 4.1 핵심 테이블

#### positions
보유 자산 정보

```sql
{
  id: uuid
  broker: 'KIS' | 'UPBIT'
  market: 'KRW' | 'KRX' | 'US'
  symbol: string
  qty: decimal
  avg_price: decimal
  updated_at: timestamptz
}
```

#### *_candles
시세 캔들 데이터 (upbit_candles, kis_candles, yf_candles)

```sql
{
  id: uuid
  symbol: string
  candle_time: timestamptz
  open: decimal
  high: decimal
  low: decimal
  close: decimal
  volume: decimal
  created_at: timestamptz
}
```

#### ai_analysis
AI 분석 결과

```sql
{
  id: uuid
  symbol: string
  market: 'KRW' | 'KRX' | 'US'
  decision: 'BUY' | 'SELL' | 'SKIP'
  confidence: decimal  # 0.0 ~ 1.0
  reasoning: text
  analyzed_at: timestamptz
  created_at: timestamptz
}
```

#### trades
거래 실행 기록

```sql
{
  id: uuid
  symbol: string
  broker: 'KIS' | 'UPBIT'
  side: 'BUY' | 'SELL'
  qty: decimal
  price: decimal
  order_id: string
  status: 'pending' | 'filled' | 'failed'
  error: text
  executed_at: timestamptz
  created_at: timestamptz
}
```

#### system_guard
시스템 가드 및 KIS 토큰

```sql
{
  id: uuid
  trading_enabled: boolean
  kis_token: text
  kis_token_expires_at: timestamptz
  token_cooldown_until: timestamptz
  updated_at: timestamptz
}
```

### 4.2 데이터 흐름 예시

#### 매수 주문 실행 흐름

```
1. AI Analyzer
   ↓ INSERT INTO ai_analysis
   { symbol: 'AAPL', decision: 'BUY', confidence: 0.85 }

2. Trade Executor (주기적 폴링)
   ↓ SELECT FROM ai_analysis WHERE confidence > 0.7
   ↓ SELECT FROM positions WHERE symbol = 'AAPL'
   ↓ 매수 규칙 적용
   ↓ 주문 크기 계산
   ↓ KIS API 주문 실행
   ↓ INSERT INTO trades
   { symbol: 'AAPL', side: 'BUY', qty: 10, status: 'filled' }
   ↓ INSERT INTO notification_events
   { type: 'trade', message: 'AAPL 10주 매수' }

3. Monitoring Bot
   ↓ SELECT FROM notification_events WHERE sent_at IS NULL
   ↓ Telegram 전송
   ↓ UPDATE notification_events SET sent_at = NOW()
```

## 5. 에러 처리 전략

### 5.1 에러 분류

| 에러 유형 | 처리 방법 | 예시 |
|----------|----------|------|
| 일시적 | 재시도 + 백오프 | 네트워크 타임아웃 |
| 영구적 | 로깅 + 스킵 | 잘못된 API 키 |
| 복구 가능 | 로깅 + 계속 | 선택적 데이터 조회 실패 |
| 치명적 | throw + 프로세스 종료 | DB 연결 실패 |

### 5.2 백오프 패턴

```typescript
import { createBackoff } from '@workspace/shared-utils';

const backoff = createBackoff({
  baseMs: 1000,      // 초기 대기 시간
  maxMs: 30000,      // 최대 대기 시간
  jitterMs: 500,     // 지터 (랜덤 요소)
});

let lastError;
for (let attempt = 0; attempt < 5; attempt++) {
  try {
    return await fetchData();
  } catch (error) {
    lastError = error;
    logger.warn('재시도', { attempt, error });
    const delay = backoff.nextDelayMs();
    await sleep(delay);
  }
}

throw lastError;  // 최종 실패
```

### 5.3 KIS Token 에러 처리

```typescript
import { TokenCooldownError } from '@workspace/kis-auth';

try {
  const token = await tokenManager.getToken();
  // API 호출
} catch (error) {
  if (error instanceof TokenCooldownError) {
    logger.info('쿨다운 중', { remainingMs: error.remainingMs });
    // 대기 또는 스킵
    return;
  }
  throw error;  // 다른 에러는 throw
}
```

## 6. 성능 최적화 전략

### 6.1 DB 쿼리 최적화

```typescript
// ❌ 비효율: 전체 컬럼 조회
const { data } = await getSupabase()
  .from('kis_candles')
  .select('*')
  .eq('symbol', 'AAPL');

// ✅ 효율: 필요한 컬럼만 조회
const { data } = await getSupabase()
  .from('kis_candles')
  .select('close, candle_time')
  .eq('symbol', 'AAPL')
  .order('candle_time', { ascending: false })
  .limit(100);
```

### 6.2 배치 처리

```typescript
// ❌ 비효율: 순차 처리
for (const symbol of symbols) {
  await fetchPrice(symbol);
}

// ✅ 효율: 배치 처리
const BATCH_SIZE = 50;
for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
  const batch = symbols.slice(i, i + BATCH_SIZE);
  await Promise.all(batch.map(s => fetchPrice(s)));
}
```

### 6.3 캐싱 전략

```typescript
// 간단한 타임스탬프 기반 캐싱
let cachedMarkets = [];
let lastFetchAt = 0;
const CACHE_TTL_MS = 60_000;  // 60초

async function getMarkets() {
  const now = Date.now();
  if (now - lastFetchAt < CACHE_TTL_MS && cachedMarkets.length > 0) {
    return cachedMarkets;
  }

  cachedMarkets = await fetchAllMarkets();
  lastFetchAt = now;
  return cachedMarkets;
}
```

## 7. 보안 고려사항

### 7.1 API 키 관리
- 환경변수로 주입 (`.env` 파일)
- 로그에 평문 노출 금지
- Git 커밋 금지 (`.gitignore`)

### 7.2 DB 접근
- Supabase Row Level Security (RLS) 활용
- 서비스별 전용 키 사용 (향후)
- 쿼리 로깅 시 민감 정보 마스킹

### 7.3 Telegram 알림
- 봇 토큰은 환경변수로 관리
- 채팅방 ID는 화이트리스트 방식

## 8. 배포 및 운영

### 8.1 서비스 실행 방식

```bash
# 개발 환경
cd services/upbit-collector
yarn dev

# 프로덕션 환경 (권장: PM2)
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 8.2 모니터링 포인트

| 항목 | 확인 방법 |
|------|----------|
| 워커 상태 | `worker_status` 테이블 |
| 수집 성공률 | `ingestion_runs` 통계 |
| AI 호출 횟수 | `ai_analysis` COUNT |
| 거래 실행 | `trades` 테이블 |
| 에러율 | 로그 집계 |

### 8.3 트러블슈팅

#### 서비스가 멈춤
1. `worker_status` 조회 → `last_run_at` 확인
2. 로그 확인 (stdout/stderr)
3. PM2 재시작: `pm2 restart service-name`

#### 데이터 수집 안 됨
1. `ingestion_runs` 조회 → `error_count` 확인
2. API 키 만료 확인
3. 네트워크 연결 확인

#### AI 분석 안 됨
1. OpenAI 키 확인
2. 쿨다운 상태 확인 (`system_guard`)
3. 예산 한도 확인 (월별 호출 횟수)

---

**마지막 업데이트:** 2026-02-11
**버전:** 1.0
