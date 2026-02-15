# ACE 프레임워크 상세 (Aspiration-Capability-Execution-Outcome)

## 1. ACE 개요

ACE 프레임워크는 **Aspiration (목표) → Capability (역량) → Execution (실행) → Outcome (결과)** 4단계로 트레이딩 의사결정을 구조화하는 방법론입니다.

**핵심 철학:**
- 모든 거래는 명확한 목표에서 시작
- 실행 전 역량(데이터, 도구, 전략) 검증
- 실행 과정 상세 기록
- 결과 분석을 통한 지속적 개선

## 2. 4단계 상세

### 2.1 Aspiration (목표)

**정의:** 왜 이 거래를 하는가? 무엇을 달성하려 하는가?

**기록 항목:**
```typescript
interface Aspiration {
  goal: string;                    // 거래 목표
  timeframe: string;               // 목표 달성 기간
  expected_return: number;         // 기대 수익률 (%)
  max_acceptable_loss: number;     // 허용 가능 최대 손실 (%)
  market_hypothesis: string;       // 시장 가설
  catalyst: string[];              // 거래 트리거 (뉴스, 기술적 신호 등)
}
```

**예시:**
```typescript
const aspiration: Aspiration = {
  goal: '비트코인 단기 상승 추세 진입',
  timeframe: '3~5일',
  expected_return: 8.0,
  max_acceptable_loss: -3.5,
  market_hypothesis: '60일 박스권 상단 돌파 시 상승 가속 예상',
  catalyst: [
    '박스권 상단 85M 돌파',
    '거래량 5배 폭증',
    'MACD 골든크로스',
  ],
};
```

**질문 리스트:**
- [ ] 이 거래의 명확한 목표가 있는가?
- [ ] 목표 달성 기간이 정의되었는가?
- [ ] 기대 수익과 허용 손실이 균형적인가?
- [ ] 시장 가설이 검증 가능한가?

### 2.2 Capability (역량)

**정의:** 이 거래를 실행할 역량이 충분한가?

**기록 항목:**
```typescript
interface Capability {
  data_quality: {
    sources: string[];             // 데이터 출처
    completeness: number;          // 데이터 완전성 (0~1)
    recency: string;               // 최신성 (예: '5분 전')
    verified: boolean;             // 검증 여부
  };
  analysis: {
    indicators_used: string[];     // 사용된 지표
    timeframes_analyzed: string[]; // 분석된 시간대
    confidence: number;            // 분석 신뢰도 (0~1)
    consensus: boolean;            // 다중 지표 일치 여부
  };
  risk_management: {
    position_size_calculated: boolean;
    stop_loss_defined: boolean;
    risk_reward_ratio: number;     // 리스크 대비 보상 비율
    portfolio_impact: number;      // 포트폴리오 영향도 (%)
  };
  execution_readiness: {
    broker_available: boolean;     // 브로커 접근 가능
    liquidity_sufficient: boolean; // 유동성 충분
    capital_available: number;     // 사용 가능 자본
    technical_issues: string[];    // 기술적 문제
  };
}
```

**예시:**
```typescript
const capability: Capability = {
  data_quality: {
    sources: ['Upbit API', 'CoinGecko'],
    completeness: 0.95,
    recency: '30초 전',
    verified: true,
  },
  analysis: {
    indicators_used: ['MA', 'MACD', 'RSI', 'Volume', 'Bollinger'],
    timeframes_analyzed: ['1d', '1h', '15m'],
    confidence: 0.84,
    consensus: true,  // 모든 시간대 매수 신호
  },
  risk_management: {
    position_size_calculated: true,
    stop_loss_defined: true,
    risk_reward_ratio: 2.4,  // 손실 3.5% vs 수익 8.4%
    portfolio_impact: 15,    // 전체 자산의 15%
  },
  execution_readiness: {
    broker_available: true,
    liquidity_sufficient: true,
    capital_available: 10000000,
    technical_issues: [],
  },
};
```

**검증 체크리스트:**
- [ ] 데이터 품질이 기준 이상인가? (completeness > 0.9)
- [ ] 3개 이상 독립 지표 분석 완료?
- [ ] 리스크/보상 비율이 2:1 이상인가?
- [ ] 브로커 및 자본 접근 가능한가?

### 2.3 Execution (실행)

**정의:** 실제 거래를 어떻게 실행했는가?

**기록 항목:**
```typescript
interface Execution {
  timestamp: string;               // 실행 시각
  order_type: 'MARKET' | 'LIMIT';
  intended_price: number;          // 의도한 가격
  executed_price: number;          // 실제 체결 가격
  slippage: number;                // 슬리피지 (%)
  quantity: number;                // 수량
  total_cost: number;              // 총 비용 (수수료 포함)
  fees: {
    trading_fee: number;
    other_fees: number;
  };
  partial_fills: number;           // 부분 체결 횟수
  execution_time_ms: number;       // 체결 소요 시간 (ms)
  notes: string[];                 // 특이사항
}
```

**예시:**
```typescript
const execution: Execution = {
  timestamp: '2026-02-15T10:23:45Z',
  order_type: 'MARKET',
  intended_price: 86000000,
  executed_price: 86150000,
  slippage: 0.17,  // 0.17% 슬리피지
  quantity: 0.12,  // BTC
  total_cost: 10338000,
  fees: {
    trading_fee: 20676,  // 0.2%
    other_fees: 0,
  },
  partial_fills: 1,
  execution_time_ms: 450,
  notes: [
    '시장가 주문으로 즉시 체결',
    '슬리피지 예상 범위 내 (< 0.5%)',
  ],
};
```

**모니터링 항목:**
- [ ] 슬리피지가 예상 범위 내인가?
- [ ] 체결 시간이 적정한가? (< 1초)
- [ ] 수수료 계산이 정확한가?
- [ ] 부분 체결로 인한 불리함은 없는가?

### 2.4 Outcome (결과)

**정의:** 거래 결과가 목표를 달성했는가?

**기록 항목:**
```typescript
interface Outcome {
  closed_at: string;               // 청산 시각
  holding_period: string;          // 보유 기간
  exit_reason: string;             // 청산 이유
  exit_price: number;              // 청산 가격
  realized_pnl: number;            // 실현 손익 (금액)
  realized_pnl_pct: number;        // 실현 손익률 (%)
  vs_expected_return: number;      // 기대 수익률 대비 차이
  max_drawdown: number;            // 최대 낙폭 (%)
  max_unrealized_gain: number;     // 최대 미실현 이익 (%)
  performance: {
    goal_achieved: boolean;        // 목표 달성 여부
    risk_managed: boolean;         // 리스크 관리 준수
    discipline_score: number;      // 계획 준수도 (0~1)
  };
  lessons_learned: string[];       // 교훈
}
```

**예시 (성공 케이스):**
```typescript
const outcome: Outcome = {
  closed_at: '2026-02-18T14:32:10Z',
  holding_period: '3일 4시간',
  exit_reason: '목표가 +8% 도달',
  exit_price: 93200000,
  realized_pnl: 846000,
  realized_pnl_pct: 8.18,
  vs_expected_return: 0.18,  // 기대 8% vs 실제 8.18%
  max_drawdown: -1.2,
  max_unrealized_gain: 9.5,
  performance: {
    goal_achieved: true,
    risk_managed: true,
    discipline_score: 0.95,
  },
  lessons_learned: [
    '박스권 돌파 전략 유효 확인',
    '거래량 확증이 중요',
    '목표가 도달 시 즉시 청산이 효과적',
  ],
};
```

**예시 (실패 케이스):**
```typescript
const outcome: Outcome = {
  closed_at: '2026-02-16T09:15:20Z',
  holding_period: '22시간',
  exit_reason: '손절매 -3.5% 트리거',
  exit_price: 83100000,
  realized_pnl: -362000,
  realized_pnl_pct: -3.50,
  vs_expected_return: -11.50,  // 기대 8% vs 실제 -3.5%
  max_drawdown: -3.8,
  max_unrealized_gain: 1.2,
  performance: {
    goal_achieved: false,
    risk_managed: true,  // 손절매 준수
    discipline_score: 0.90,
  },
  lessons_learned: [
    '거짓 브레이크아웃 (False Breakout) 발생',
    '거래량 지속성 부족 (1일 후 감소)',
    '다중 시간대 확인 필요 (1h 신호 약했음)',
  ],
};
```

**성과 평가 지표:**
- [ ] 목표 달성률: `goal_achieved`
- [ ] 리스크 관리 준수: `risk_managed`
- [ ] 계획 준수도: `discipline_score > 0.8`
- [ ] 교훈 도출: `lessons_learned` 작성

## 3. ACE 로그 통합 구조

### 3.1 완전한 거래 로그

```typescript
interface ACETradeLog {
  id: string;
  symbol: string;
  broker: string;
  market: string;

  // 1. Aspiration
  aspiration: Aspiration;

  // 2. Capability
  capability: Capability;

  // 3. Execution
  execution: Execution;

  // 4. Outcome (청산 후 기록)
  outcome?: Outcome;

  // 메타데이터
  created_at: string;
  updated_at: string;
  tags: string[];
}
```

### 3.2 DB 스키마 (Supabase)

```sql
CREATE TABLE ace_trade_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  broker TEXT NOT NULL,
  market TEXT NOT NULL,

  -- JSON 컬럼으로 각 단계 저장
  aspiration JSONB NOT NULL,
  capability JSONB NOT NULL,
  execution JSONB NOT NULL,
  outcome JSONB,  -- 청산 후 업데이트

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  tags TEXT[]
);

CREATE INDEX idx_ace_logs_symbol ON ace_trade_logs (symbol);
CREATE INDEX idx_ace_logs_created_at ON ace_trade_logs (created_at DESC);
CREATE INDEX idx_ace_logs_tags ON ace_trade_logs USING GIN (tags);
```

### 3.3 TypeScript 저장 함수

```typescript
import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';

async function logACETrade(log: ACETradeLog): Promise<string> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_trade_logs')
    .insert({
      symbol: log.symbol,
      broker: log.broker,
      market: log.market,
      aspiration: log.aspiration,
      capability: log.capability,
      execution: log.execution,
      outcome: log.outcome || null,
      created_at: nowIso(),
      updated_at: nowIso(),
      tags: log.tags,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(`ACE 로그 저장 실패: ${error.message}`);
  }

  return data.id;
}

async function updateACEOutcome(
  logId: string,
  outcome: Outcome
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('ace_trade_logs')
    .update({
      outcome,
      updated_at: nowIso(),
    })
    .eq('id', logId);

  if (error) {
    throw new Error(`ACE Outcome 업데이트 실패: ${error.message}`);
  }
}
```

## 4. ACE 기반 성과 분석

### 4.1 목표 달성률 분석

```typescript
async function analyzeGoalAchievementRate(): Promise<{
  total: number;
  achieved: number;
  rate: number;
}> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_trade_logs')
    .select('outcome')
    .not('outcome', 'is', null);

  if (error) throw new Error(error.message);

  const total = data.length;
  const achieved = data.filter(
    (log) => log.outcome?.performance?.goal_achieved === true
  ).length;

  return {
    total,
    achieved,
    rate: achieved / total,
  };
}
```

### 4.2 리스크 관리 준수율

```typescript
async function analyzeRiskDiscipline(): Promise<{
  total: number;
  disciplined: number;
  rate: number;
}> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_trade_logs')
    .select('outcome')
    .not('outcome', 'is', null);

  if (error) throw new Error(error.message);

  const total = data.length;
  const disciplined = data.filter(
    (log) => log.outcome?.performance?.risk_managed === true
  ).length;

  return {
    total,
    disciplined,
    rate: disciplined / total,
  };
}
```

### 4.3 기대 수익률 대비 실제 수익률

```typescript
async function analyzeExpectationVsReality(): Promise<{
  avg_expected: number;
  avg_realized: number;
  deviation: number;
}> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ace_trade_logs')
    .select('aspiration, outcome')
    .not('outcome', 'is', null);

  if (error) throw new Error(error.message);

  const expectations = data.map((log) => log.aspiration.expected_return);
  const realizations = data.map((log) => log.outcome.realized_pnl_pct);

  const avg_expected = expectations.reduce((a, b) => a + b, 0) / expectations.length;
  const avg_realized = realizations.reduce((a, b) => a + b, 0) / realizations.length;

  return {
    avg_expected,
    avg_realized,
    deviation: avg_realized - avg_expected,
  };
}
```

## 5. 개선 사이클

### 5.1 회고 프로세스

**주간 회고:**
```typescript
async function weeklyRetrospective(): Promise<string> {
  const logs = await getLastWeekACELogs();

  const report = `
## 주간 거래 회고 (${getWeekRange()})

### 1. 거래 통계
- 총 거래 횟수: ${logs.length}
- 목표 달성: ${countGoalAchieved(logs)} (${achievementRate(logs)}%)
- 평균 수익률: ${avgPnL(logs)}%

### 2. 주요 성공 케이스
${getSuccessCases(logs)}

### 3. 주요 실패 케이스
${getFailureCases(logs)}

### 4. 교훈 종합
${aggregateLessons(logs)}

### 5. 다음 주 개선 계획
${generateImprovementPlan(logs)}
  `;

  return report;
}
```

### 5.2 전략 조정

```typescript
interface StrategyAdjustment {
  based_on_logs: string[];  // ACE 로그 ID
  adjustment_type: 'CONFIDENCE' | 'INDICATOR' | 'RISK' | 'EXECUTION';
  before: any;
  after: any;
  reason: string;
  expected_impact: string;
}

// 예시: 신뢰도 임계값 상향 조정
const adjustment: StrategyAdjustment = {
  based_on_logs: ['log-123', 'log-456', 'log-789'],
  adjustment_type: 'CONFIDENCE',
  before: { min_confidence: 0.7 },
  after: { min_confidence: 0.75 },
  reason: '신뢰도 0.7~0.75 구간 거래의 승률이 45%로 낮음',
  expected_impact: '거짓 신호 감소, 거래 횟수 10% 감소 예상',
};
```

## 6. 참고 문헌

1. **The Daily Trading Coach** - Brett Steenbarger
   - 자기 성찰 및 개선 프로세스

2. **Trading in the Zone** - Mark Douglas
   - 계획 준수 및 심리 관리

3. **Principles** - Ray Dalio
   - 체계적 의사결정 및 피드백 루프

4. **Market Wizards** - Jack Schwager
   - 전문 트레이더의 의사결정 프로세스

5. **Thinking, Fast and Slow** - Daniel Kahneman
   - 인지 편향 및 의사결정 오류

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
