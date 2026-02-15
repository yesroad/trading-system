# Trading System - 데이터베이스 가이드

이 문서는 Supabase (PostgreSQL) 데이터베이스 스키마, 접근 패턴, 쿼리 예시를 설명합니다.

## 1. 데이터베이스 개요

### 1.1 기본 정보
- **플랫폼**: Supabase (PostgreSQL)
- **클라이언트**: @supabase/supabase-js
- **접근 레이어**: @workspace/db-client
- **환경변수**:
  - `SUPABASE_URL`: Supabase 프로젝트 URL
  - `SUPABASE_KEY`: 서비스 키 (시크릿)

### 1.2 연결 방법

```typescript
import { getSupabase } from '@workspace/db-client';

// 싱글톤 인스턴스
const supabase = getSupabase();

// 쿼리 예시
const { data, error } = await supabase
  .from('table_name')
  .select('*')
  .eq('id', 1);

if (error) {
  throw new Error(`Query failed: ${error.message}`);
}
```

## 2. 테이블 스키마

### 2.1 자산 관리

#### `positions` - 보유 자산

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| broker | text | 브로커 | NOT NULL, 'KIS' \| 'UPBIT' |
| market | text | 시장 | NOT NULL, 'KRW' \| 'KRX' \| 'US' |
| symbol | text | 심볼 | NOT NULL |
| qty | decimal | 수량 | NOT NULL, >= 0 |
| avg_price | decimal | 평균 단가 | NOT NULL, >= 0 |
| updated_at | timestamptz | 업데이트 시각 | NOT NULL, DEFAULT NOW() |

**인덱스:**
- `idx_positions_broker_market_symbol` ON (broker, market, symbol)
- `idx_positions_updated_at` ON (updated_at DESC)

**유니크 제약:**
- `uq_positions_broker_market_symbol` UNIQUE (broker, market, symbol)

**쿼리 예시:**
```typescript
// 특정 브로커의 모든 보유 자산 조회
const { data } = await supabase
  .from('positions')
  .select('*')
  .eq('broker', 'UPBIT')
  .gt('qty', 0);

// 보유 자산 업데이트 (upsert)
const { error } = await supabase
  .from('positions')
  .upsert({
    broker: 'KIS',
    market: 'KRX',
    symbol: '005930',
    qty: 10,
    avg_price: 70000,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'broker,market,symbol',
  });
```

#### `account_cash` - 계좌 현금

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| broker | text | 브로커 | NOT NULL |
| currency | text | 통화 | NOT NULL, 'KRW' \| 'USD' |
| available | decimal | 사용 가능 금액 | NOT NULL, >= 0 |
| total | decimal | 총 금액 | NOT NULL, >= 0 |
| updated_at | timestamptz | 업데이트 시각 | NOT NULL |

**인덱스:**
- `idx_account_cash_broker_currency` ON (broker, currency)

**유니크 제약:**
- `uq_account_cash_broker_currency` UNIQUE (broker, currency)

**쿼리 예시:**
```typescript
// 계좌 현금 조회
const { data } = await supabase
  .from('account_cash')
  .select('available')
  .eq('broker', 'KIS')
  .eq('currency', 'KRW')
  .single();

// 계좌 현금 업데이트
const { error } = await supabase
  .from('account_cash')
  .upsert({
    broker: 'UPBIT',
    currency: 'KRW',
    available: 1000000,
    total: 1500000,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'broker,currency',
  });
```

### 2.2 시세 데이터

#### `upbit_candles` - 업비트 캔들 (암호화폐)

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| symbol | text | 심볼 (예: KRW-BTC) | NOT NULL |
| candle_time | timestamptz | 캔들 시각 | NOT NULL |
| open | decimal | 시가 | NOT NULL |
| high | decimal | 고가 | NOT NULL |
| low | decimal | 저가 | NOT NULL |
| close | decimal | 종가 | NOT NULL |
| volume | decimal | 거래량 | NOT NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_upbit_candles_symbol_time` ON (symbol, candle_time DESC)
- `idx_upbit_candles_candle_time` ON (candle_time DESC)

**유니크 제약:**
- `uq_upbit_candles_symbol_time` UNIQUE (symbol, candle_time)

**쿼리 예시:**
```typescript
// 최근 100개 캔들 조회
const { data } = await supabase
  .from('upbit_candles')
  .select('*')
  .eq('symbol', 'KRW-BTC')
  .order('candle_time', { ascending: false })
  .limit(100);

// 캔들 저장 (upsert)
const { error } = await supabase
  .from('upbit_candles')
  .upsert([
    {
      symbol: 'KRW-BTC',
      candle_time: '2026-02-11T10:00:00Z',
      open: 100000,
      high: 105000,
      low: 99000,
      close: 103000,
      volume: 1000,
    },
  ], {
    onConflict: 'symbol,candle_time',
  });
```

#### `kis_candles` - KIS 캔들 (국내주식)

스키마는 `upbit_candles`와 유사하나, `symbol`은 종목 코드 (예: '005930')

#### `yf_candles` - Yahoo Finance 캔들 (미국주식)

스키마는 `upbit_candles`와 유사하나, `symbol`은 티커 (예: 'AAPL')

### 2.3 AI 분석

#### `ai_analysis` - AI 분석 결과

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| symbol | text | 심볼 | NOT NULL |
| market | text | 시장 | NOT NULL, 'KRW' \| 'KRX' \| 'US' |
| decision | text | 결정 | NOT NULL, 'BUY' \| 'SELL' \| 'SKIP' |
| confidence | decimal | 신뢰도 (0~1) | NOT NULL, >= 0, <= 1 |
| reasoning | text | 분석 근거 | NULL |
| price_at_analysis | decimal | 분석 시점 가격 | NULL |
| analyzed_at | timestamptz | 분석 시각 | NOT NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_ai_analysis_symbol_analyzed_at` ON (symbol, analyzed_at DESC)
- `idx_ai_analysis_analyzed_at` ON (analyzed_at DESC)
- `idx_ai_analysis_decision` ON (decision)

**쿼리 예시:**
```typescript
// 최근 BUY 신호 조회
const { data } = await supabase
  .from('ai_analysis')
  .select('*')
  .eq('decision', 'BUY')
  .gte('confidence', 0.7)
  .gte('analyzed_at', new Date(Date.now() - 3600000).toISOString())  // 1시간 이내
  .order('confidence', { ascending: false });

// AI 분석 결과 저장
const { error } = await supabase
  .from('ai_analysis')
  .insert({
    symbol: 'AAPL',
    market: 'US',
    decision: 'BUY',
    confidence: 0.85,
    reasoning: '기술적 지표 상승 신호',
    price_at_analysis: 150.50,
    analyzed_at: new Date().toISOString(),
  });
```

#### `ai_decisions` - AI 의사결정 (레거시?)

이 테이블은 `ai_analysis`와 중복될 수 있음. 확인 필요.

### 2.4 거래 실행

#### `trades` - 거래 기록

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| symbol | text | 심볼 | NOT NULL |
| broker | text | 브로커 | NOT NULL, 'KIS' \| 'UPBIT' |
| market | text | 시장 | NOT NULL |
| side | text | 매수/매도 | NOT NULL, 'BUY' \| 'SELL' |
| qty | decimal | 수량 | NOT NULL, > 0 |
| price | decimal | 가격 | NOT NULL, > 0 |
| order_id | text | 주문 ID | NULL |
| status | text | 상태 | NOT NULL, 'pending' \| 'filled' \| 'failed' |
| error | text | 에러 메시지 | NULL |
| executed_at | timestamptz | 실행 시각 | NOT NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_trades_symbol_executed_at` ON (symbol, executed_at DESC)
- `idx_trades_executed_at` ON (executed_at DESC)
- `idx_trades_status` ON (status)

**쿼리 예시:**
```typescript
// 최근 거래 내역 조회
const { data } = await supabase
  .from('trades')
  .select('*')
  .eq('broker', 'KIS')
  .order('executed_at', { ascending: false })
  .limit(50);

// 거래 기록 저장
const { error } = await supabase
  .from('trades')
  .insert({
    symbol: 'AAPL',
    broker: 'KIS',
    market: 'US',
    side: 'BUY',
    qty: 10,
    price: 150.50,
    order_id: 'ORD-12345',
    status: 'filled',
    executed_at: new Date().toISOString(),
  });

// 거래 상태 업데이트
const { error: updateError } = await supabase
  .from('trades')
  .update({ status: 'filled' })
  .eq('order_id', 'ORD-12345');
```

### 2.5 시스템 운영

#### `system_guard` - 시스템 가드 및 KIS 토큰

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| trading_enabled | boolean | 거래 활성화 | NOT NULL, DEFAULT false |
| kis_token | text | KIS API 토큰 | NULL |
| kis_token_expires_at | timestamptz | 토큰 만료 시각 | NULL |
| token_cooldown_until | timestamptz | 쿨다운 종료 시각 | NULL |
| updated_at | timestamptz | 업데이트 시각 | DEFAULT NOW() |

**특징:**
- 단일 행 테이블 (id = 'default')
- 전역 설정 저장

**쿼리 예시:**
```typescript
// 시스템 가드 조회
const { data } = await supabase
  .from('system_guard')
  .select('*')
  .eq('id', 'default')
  .single();

// 거래 활성화 토글
const { error } = await supabase
  .from('system_guard')
  .update({ trading_enabled: true })
  .eq('id', 'default');

// KIS 토큰 저장
const { error: tokenError } = await supabase
  .from('system_guard')
  .update({
    kis_token: 'new-token',
    kis_token_expires_at: new Date(Date.now() + 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', 'default');
```

#### `worker_status` - 워커 상태

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| worker_id | text | 워커 ID | NOT NULL, UNIQUE |
| last_run_at | timestamptz | 마지막 실행 시각 | NOT NULL |
| status | text | 상태 | NOT NULL, 'ok' \| 'error' |
| error | text | 에러 메시지 | NULL |
| metadata | jsonb | 추가 메타데이터 | NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |
| updated_at | timestamptz | 업데이트 시각 | DEFAULT NOW() |

**유니크 제약:**
- `uq_worker_status_worker_id` UNIQUE (worker_id)

**쿼리 예시:**
```typescript
import { upsertWorkerStatus } from '@workspace/db-client';

// 워커 상태 업데이트 (db-client 함수)
await upsertWorkerStatus({
  worker_id: 'upbit-collector',
  last_run_at: new Date().toISOString(),
  status: 'ok',
});

// 모든 워커 상태 조회
const { data } = await supabase
  .from('worker_status')
  .select('*')
  .order('last_run_at', { ascending: false });

// 장시간 미실행 워커 조회
const threshold = new Date(Date.now() - 300000);  // 5분 전
const { data: staleWorkers } = await supabase
  .from('worker_status')
  .select('*')
  .lt('last_run_at', threshold.toISOString());
```

#### `ingestion_runs` - 데이터 수집 배치

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| source | text | 수집 소스 | NOT NULL |
| target_count | integer | 대상 개수 | NOT NULL, >= 0 |
| success_count | integer | 성공 개수 | DEFAULT 0 |
| error_count | integer | 실패 개수 | DEFAULT 0 |
| started_at | timestamptz | 시작 시각 | NOT NULL, DEFAULT NOW() |
| finished_at | timestamptz | 완료 시각 | NULL |
| metadata | jsonb | 추가 메타데이터 | NULL |

**인덱스:**
- `idx_ingestion_runs_source_started_at` ON (source, started_at DESC)
- `idx_ingestion_runs_started_at` ON (started_at DESC)

**쿼리 예시:**
```typescript
import { insertIngestionRun, finishIngestionRun } from '@workspace/db-client';

// 배치 시작
const runId = await insertIngestionRun({
  source: 'upbit-collector',
  target_count: 50,
});

// ... 수집 작업 ...

// 배치 완료
await finishIngestionRun(runId, {
  success_count: 48,
  error_count: 2,
});

// 최근 배치 조회
const { data } = await supabase
  .from('ingestion_runs')
  .select('*')
  .eq('source', 'kis-collector')
  .order('started_at', { ascending: false })
  .limit(20);
```

#### `notification_events` - 알림 이벤트

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| type | text | 알림 타입 | NOT NULL |
| message | text | 메시지 | NOT NULL |
| metadata | jsonb | 추가 메타데이터 | NULL |
| sent_at | timestamptz | 발송 시각 | NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_notification_events_sent_at` ON (sent_at NULLS FIRST)
- `idx_notification_events_type` ON (type)
- `idx_notification_events_created_at` ON (created_at DESC)

**쿼리 예시:**
```typescript
// 알림 이벤트 생성
const { error } = await supabase
  .from('notification_events')
  .insert({
    type: 'trade',
    message: 'AAPL 10주 매수 완료',
    metadata: { symbol: 'AAPL', qty: 10 },
  });

// 미발송 알림 조회
const { data } = await supabase
  .from('notification_events')
  .select('*')
  .is('sent_at', null)
  .order('created_at', { ascending: true });

// 알림 발송 완료 표시
const { error: markError } = await supabase
  .from('notification_events')
  .update({ sent_at: new Date().toISOString() })
  .eq('id', eventId);
```

### 2.6 트레이딩 분석 및 리스크 관리

#### `trading_signals` - 매매 신호

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| symbol | text | 심볼 | NOT NULL |
| market | text | 시장 | NOT NULL, 'KRW' \| 'KRX' \| 'US' |
| type | text | 신호 유형 | NOT NULL, 'BUY' \| 'SELL' \| 'HOLD' |
| entry | decimal | 진입가 | NOT NULL |
| target | decimal | 목표가 | NOT NULL |
| stop_loss | decimal | 손절가 | NOT NULL |
| confidence | decimal | 신뢰도 (0~1) | NOT NULL, >= 0, <= 1 |
| reason | text | 근거 | NULL |
| indicators | jsonb | 기술적 지표 | NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_trading_signals_symbol_created_at` ON (symbol, created_at DESC)
- `idx_trading_signals_type` ON (type)
- `idx_trading_signals_confidence` ON (confidence DESC)

**쿼리 예시:**
```typescript
// 최근 고신뢰도 BUY 신호 조회
const { data } = await supabase
  .from('trading_signals')
  .select('*')
  .eq('type', 'BUY')
  .gte('confidence', 0.7)
  .gte('created_at', new Date(Date.now() - 3600000).toISOString())
  .order('confidence', { ascending: false });

// 신호 생성
const { error } = await supabase
  .from('trading_signals')
  .insert({
    symbol: 'BTC',
    market: 'KRW',
    type: 'BUY',
    entry: 93000,
    target: 98000,
    stop_loss: 91500,
    confidence: 0.85,
    reason: 'Elliott Wave 5파동 완성, RSI 과매도',
    indicators: { rsi: 28, macd: { signal: 'bullish' } },
  });
```

#### `ace_logs` - ACE 프레임워크 거래 로그

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| symbol | text | 심볼 | NOT NULL |
| aspiration | jsonb | 목표 | NOT NULL |
| capability | jsonb | 능력 | NOT NULL |
| execution | jsonb | 실행 | NOT NULL |
| outcome | jsonb | 결과 | NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |
| updated_at | timestamptz | 업데이트 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_ace_logs_symbol` ON (symbol)
- `idx_ace_logs_created_at` ON (created_at DESC)

**쿼리 예시:**
```typescript
// ACE 로그 저장
const { error } = await supabase
  .from('ace_logs')
  .insert({
    symbol: 'AAPL',
    aspiration: {
      strategy: 'Elliott Wave reversal',
      targetProfit: '5%',
      maxLoss: '2%',
      timeHorizon: '3일',
    },
    capability: {
      signals: [{ type: 'technical', method: 'Elliott Wave', confidence: 0.65 }],
      marketAnalysis: { breadth: 'Narrowing', sectorMomentum: 'Mixed' },
      riskAssessment: { rr_ratio: 2.1, leverage: 1.5 },
    },
    execution: {
      decision: 'BUY',
      actualEntry: 150.50,
      actualTarget: 158.00,
      actualStopLoss: 147.50,
      size: 10,
      timestamp: new Date().toISOString(),
      reason: '모든 리스크 체크 통과',
    },
  });

// 결과 업데이트
const { error: updateError } = await supabase
  .from('ace_logs')
  .update({
    outcome: {
      actualProfit: '4.8%',
      actualDuration: '2일',
      lessons: '목표가 근접 달성, 예상보다 빠른 진입',
    },
    updated_at: new Date().toISOString(),
  })
  .eq('id', logId);
```

#### `risk_events` - 리스크 이벤트

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| event_type | text | 이벤트 유형 | NOT NULL |
| symbol | text | 심볼 | NULL |
| violation_type | text | 위반 유형 | NULL |
| violation_details | jsonb | 위반 상세 | NULL |
| severity | text | 심각도 | NOT NULL, 'low' \| 'medium' \| 'high' \| 'critical' |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_risk_events_event_type` ON (event_type)
- `idx_risk_events_severity` ON (severity)
- `idx_risk_events_created_at` ON (created_at DESC)

**쿼리 예시:**
```typescript
// 리스크 이벤트 기록
const { error } = await supabase
  .from('risk_events')
  .insert({
    event_type: 'leverage_violation',
    symbol: 'BTC',
    violation_type: 'max_leverage_exceeded',
    violation_details: {
      requested: 2.0,
      maximum: 1.5,
      denied: true,
    },
    severity: 'high',
  });

// 최근 critical 이벤트 조회
const { data } = await supabase
  .from('risk_events')
  .select('*')
  .eq('severity', 'critical')
  .gte('created_at', new Date(Date.now() - 86400000).toISOString())
  .order('created_at', { ascending: false });
```

#### `market_breadth` - 시장 폭 지표

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| date | date | 날짜 | NOT NULL |
| market | text | 시장 | NOT NULL, 'US' \| 'KRX' |
| sp500_breadth_pct | decimal | S&P 500 Breadth % | NULL |
| uptrend_ratio_pct | decimal | 상승 추세 비율 % | NULL |
| new_highs | integer | 신고가 종목 수 | NULL |
| new_lows | integer | 신저가 종목 수 | NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_market_breadth_date` ON (date DESC)
- `idx_market_breadth_market_date` ON (market, date DESC)

**유니크 제약:**
- `uq_market_breadth_market_date` UNIQUE (market, date)

**쿼리 예시:**
```typescript
// Breadth 데이터 저장
const { error } = await supabase
  .from('market_breadth')
  .upsert({
    date: '2026-02-15',
    market: 'US',
    sp500_breadth_pct: 75.5,
    uptrend_ratio_pct: 55.2,
    new_highs: 45,
    new_lows: 12,
  }, {
    onConflict: 'market,date',
  });

// 최근 30일 Breadth 추세 조회
const { data } = await supabase
  .from('market_breadth')
  .select('*')
  .eq('market', 'US')
  .gte('date', new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0])
  .order('date', { ascending: false });
```

#### `news_events` - 뉴스 이벤트

| 컬럼 | 타입 | 설명 | 제약 |
|------|------|------|------|
| id | uuid | PK | PRIMARY KEY |
| title | text | 제목 | NOT NULL |
| summary | text | 요약 | NULL |
| source | text | 출처 | NULL |
| impact_score | integer | 임팩트 점수 (1-10) | CHECK (impact_score >= 1 AND impact_score <= 10) |
| affected_sectors | text[] | 영향받은 섹터 | NULL |
| price_impact_pct | decimal | 가격 영향 % | NULL |
| published_at | timestamptz | 발행 시각 | NOT NULL |
| created_at | timestamptz | 생성 시각 | DEFAULT NOW() |

**인덱스:**
- `idx_news_events_published_at` ON (published_at DESC)
- `idx_news_events_impact_score` ON (impact_score DESC)
- `idx_news_events_source` ON (source)

**쿼리 예시:**
```typescript
// 뉴스 이벤트 저장
const { error } = await supabase
  .from('news_events')
  .insert({
    title: 'FOMC 금리 동결 결정',
    summary: '연준이 기준금리를 현 수준으로 유지',
    source: 'Federal Reserve',
    impact_score: 9,
    affected_sectors: ['Financials', 'Real Estate', 'Utilities'],
    price_impact_pct: 2.5,
    published_at: '2026-02-15T14:00:00Z',
  });

// 최근 10일 고임팩트 뉴스 조회
const { data } = await supabase
  .from('news_events')
  .select('*')
  .gte('impact_score', 7)
  .gte('published_at', new Date(Date.now() - 10 * 86400000).toISOString())
  .order('published_at', { ascending: false });
```

## 3. 공통 쿼리 패턴

### 3.1 에러 처리

```typescript
// ✅ 권장: 에러 체크 필수
const { data, error } = await supabase
  .from('table')
  .select('*');

if (error) {
  logger.error('쿼리 실패', { error });
  throw new Error(`Query failed: ${error.message}`);
}

// data 사용
```

### 3.2 upsert (삽입 또는 업데이트)

```typescript
// onConflict 지정 필수
const { error } = await supabase
  .from('positions')
  .upsert({
    broker: 'KIS',
    market: 'KRX',
    symbol: '005930',
    qty: 10,
    avg_price: 70000,
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'broker,market,symbol',  // 유니크 제약 컬럼
  });
```

### 3.3 페이징

```typescript
const PAGE_SIZE = 50;
const page = 2;

const { data, error } = await supabase
  .from('trades')
  .select('*')
  .order('executed_at', { ascending: false })
  .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
```

### 3.4 집계 쿼리

```typescript
// COUNT
const { count, error } = await supabase
  .from('trades')
  .select('*', { count: 'exact', head: true })
  .eq('status', 'filled');

// SUM, AVG (PostgreSQL 함수 사용)
const { data, error } = await supabase
  .rpc('calculate_total_value', {
    broker_param: 'KIS',
  });
```

### 3.5 트랜잭션

Supabase 클라이언트는 트랜잭션 직접 지원 안 함.
PostgreSQL 함수 (RPC)로 구현해야 함.

```sql
-- 예시: 포지션 업데이트 + 거래 기록
CREATE OR REPLACE FUNCTION execute_trade(
  p_symbol TEXT,
  p_broker TEXT,
  p_market TEXT,
  p_side TEXT,
  p_qty DECIMAL,
  p_price DECIMAL
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_trade_id uuid;
BEGIN
  -- 거래 기록 삽입
  INSERT INTO trades (symbol, broker, market, side, qty, price, status, executed_at)
  VALUES (p_symbol, p_broker, p_market, p_side, p_qty, p_price, 'filled', NOW())
  RETURNING id INTO v_trade_id;

  -- 포지션 업데이트
  IF p_side = 'BUY' THEN
    -- 매수: 수량 증가
    INSERT INTO positions (broker, market, symbol, qty, avg_price, updated_at)
    VALUES (p_broker, p_market, p_symbol, p_qty, p_price, NOW())
    ON CONFLICT (broker, market, symbol)
    DO UPDATE SET
      qty = positions.qty + EXCLUDED.qty,
      avg_price = ((positions.qty * positions.avg_price) + (EXCLUDED.qty * EXCLUDED.avg_price)) / (positions.qty + EXCLUDED.qty),
      updated_at = NOW();
  ELSE
    -- 매도: 수량 감소
    UPDATE positions
    SET qty = qty - p_qty, updated_at = NOW()
    WHERE broker = p_broker AND market = p_market AND symbol = p_symbol;
  END IF;

  RETURN v_trade_id;
END;
$$;
```

```typescript
// TypeScript에서 호출
const { data: tradeId, error } = await supabase
  .rpc('execute_trade', {
    p_symbol: 'AAPL',
    p_broker: 'KIS',
    p_market: 'US',
    p_side: 'BUY',
    p_qty: 10,
    p_price: 150.50,
  });
```

## 4. 인덱스 전략

### 4.1 복합 인덱스 우선

```sql
-- ✅ 복합 인덱스 (조회 패턴에 맞게)
CREATE INDEX idx_candles_symbol_time ON upbit_candles (symbol, candle_time DESC);

-- 쿼리 시 인덱스 활용
SELECT * FROM upbit_candles
WHERE symbol = 'KRW-BTC'
ORDER BY candle_time DESC
LIMIT 100;
```

### 4.2 부분 인덱스

```sql
-- 특정 조건만 인덱싱 (성능 향상)
CREATE INDEX idx_trades_pending ON trades (created_at DESC)
WHERE status = 'pending';
```

### 4.3 JSONB 인덱스

```sql
-- JSONB 컬럼의 특정 키 인덱싱
CREATE INDEX idx_metadata_symbol ON notification_events ((metadata->>'symbol'));
```

## 5. 마이그레이션 전략

### 5.1 Supabase 마이그레이션 파일

```sql
-- migrations/001_initial_schema.sql
CREATE TABLE positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broker TEXT NOT NULL,
  market TEXT NOT NULL,
  symbol TEXT NOT NULL,
  qty DECIMAL NOT NULL CHECK (qty >= 0),
  avg_price DECIMAL NOT NULL CHECK (avg_price >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (broker, market, symbol)
);

CREATE INDEX idx_positions_broker_market_symbol ON positions (broker, market, symbol);
CREATE INDEX idx_positions_updated_at ON positions (updated_at DESC);
```

### 5.2 스키마 변경 시 주의사항

1. **컬럼 추가**: `ALTER TABLE ADD COLUMN` (기본값 지정)
2. **컬럼 삭제**: 먼저 서비스에서 사용 중지 확인
3. **컬럼 타입 변경**: 데이터 마이그레이션 필요 (주의)
4. **인덱스 추가**: `CONCURRENTLY` 옵션 사용 (락 방지)

```sql
-- 인덱스 추가 (락 없이)
CREATE INDEX CONCURRENTLY idx_new ON table_name (column_name);
```

## 6. 성능 최적화

### 6.1 쿼리 최적화

```typescript
// ❌ 비효율: 전체 조회 후 필터링
const { data } = await supabase
  .from('upbit_candles')
  .select('*');
const filtered = data.filter(c => c.symbol === 'KRW-BTC');

// ✅ 효율: DB에서 필터링
const { data } = await supabase
  .from('upbit_candles')
  .select('close, candle_time')  // 필요한 컬럼만
  .eq('symbol', 'KRW-BTC')
  .order('candle_time', { ascending: false })
  .limit(100);
```

### 6.2 배치 삽입

```typescript
// ❌ 비효율: 개별 삽입
for (const candle of candles) {
  await supabase.from('upbit_candles').insert(candle);
}

// ✅ 효율: 배치 삽입
await supabase
  .from('upbit_candles')
  .insert(candles);  // 배열로 한 번에
```

### 6.3 연결 풀 관리

Supabase 클라이언트는 내부적으로 연결 풀 관리.
싱글톤 인스턴스 사용 권장.

```typescript
// ✅ 권장: 싱글톤
import { getSupabase } from '@workspace/db-client';
const supabase = getSupabase();

// ❌ 비권장: 매번 새 인스턴스
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);  // 매번 연결 생성
```

## 7. 보안

### 7.1 Row Level Security (RLS)

Supabase의 RLS 기능 활용 (향후 적용)

```sql
-- 예시: 각 브로커별 데이터 격리
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_isolation ON positions
  FOR ALL
  USING (broker = current_setting('app.current_broker'));
```

### 7.2 서비스 키 vs 익명 키

- **서비스 키 (SUPABASE_KEY)**: RLS 무시, 모든 권한
- **익명 키**: RLS 적용, 제한된 권한

현재는 서비스 키 사용 (모든 서비스가 전체 데이터 접근 필요)

---

**마지막 업데이트:** 2026-02-11
**버전:** 1.0
