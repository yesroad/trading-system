# 🎯 Trading Skills Integration Guide

## 개요

이 문서는 trading-system에 통합된 트레이딩 전문 스킬들의 사용법을 안내합니다.

## 통합 스킬 목록

### ✅ 완료된 스킬 (Phase 1)

#### 1. `technical-analyst` ⭐⭐⭐
**출처:** tradermonty/claude-trading-skills  
**용도:** Elliott Wave, 피보나치, 일목균형표 기반 차트 분석

**사용 예시:**
```
"BTC 4시간봉 차트를 technical-analyst로 분석하고,
 분석 결과를 coding-standards 지켜서
 TypeScript 신호 생성 함수로 만들어줘"
```

#### 2. `risk-management` ⭐⭐⭐
**출처:** jmanhype/qts (Python → TypeScript 포팅)  
**용도:** 포지션 사이징, ATR 손절매, 일일 손실 한도

**핵심 기능:**
- 레버리지 캡: BTC/ETH 1.5x, 알트 1.2x, 포트폴리오 1.0x
- ATR 기반 동적 손절매 (0.5% ~ 5% 범위)
- 일일 -5% 손실 시 자동 청산 + 60분 쿨다운
- 리스크/보상 비율 1.5 이상 검증

**사용 예시:**
```typescript
import { validateNewPosition } from '@/skills/risk-management';

const signal = {
  symbol: 'BTC',
  entry: new Big(93000),
  target: new Big(98000),
  stopLoss: new Big(91500),
  leverage: new Big(1.5),
};

const result = await validateNewPosition(signal);
// result.approved === true/false
// result.violations: string[]
```

### 🚧 진행 중 (Phase 2-3)

다음 스킬들은 추후 추가 예정:
- `market-analysis` - 섹터/breadth/뉴스 분석 통합
- `stock-screening` - CANSLIM 등 스크리닝
- `backtest-framework` - 백테스팅 방법론
- `signal-generation` - 매매 신호 생성
- `compliance-logging` - ACE 로깅

## 실전 워크플로우

### 시나리오 1: 차트 분석 → 신호 생성 → 리스크 검증

```
Step 1: 차트 분석
--------------------------------------
사용자: "업비트 BTC/KRW 차트를 technical-analyst로 분석해줘"
        [차트 이미지 업로드]

Claude: (technical-analyst 스킬 로드)
        "Elliott Wave 5파동 완성
         피보나치 61.8% 되돌림 목표: ₩85,000,000
         
         메인 시나리오 (65%): 조정 시작
         - 진입: 현재가 숏
         - 목표: ₩85,000,000
         - 손절: ₩95,000,000"

Step 2: 리스크 검증
--------------------------------------
사용자: "이 신호를 risk-management로 검증하고
        coding-standards 지켜서 TypeScript로 구현해줘"

Claude: (risk-management + coding-standards 통합)

// services/signal-generator/src/validators/signal-validator.ts
import Big from 'big.js';
import { validateNewPosition } from '@workspace/risk-management';
import { z } from 'zod';

const SignalSchema = z.object({
  symbol: z.string(),
  side: z.enum(['long', 'short']),
  entry: z.string(),
  target: z.string(),
  stopLoss: z.string(),
  leverage: z.number(),
});

export async function validateSignal(raw: unknown) {
  const signal = SignalSchema.parse(raw);
  
  const result = await validateNewPosition({
    symbol: signal.symbol,
    side: signal.side,
    entry: new Big(signal.entry),
    target: new Big(signal.target),
    stopLoss: new Big(signal.stopLoss),
    leverage: new Big(signal.leverage),
  });
  
  if (!result.approved) {
    throw new Error(
      `Signal rejected: ${result.violations.join(', ')}`
    );
  }
  
  return {
    ...signal,
    riskRewardRatio: result.ratio?.toFixed(2),
    positionSize: result.sizing?.size.toString(),
  };
}

Step 3: DB 저장
--------------------------------------
사용자: "database-operations 스킬 참고해서
        검증된 신호를 DB에 저장하는 스키마 만들어줘"

Claude: (database-operations 스킬)

-- DB 스키마
CREATE TABLE validated_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('long', 'short')),
  entry_price NUMERIC(20, 8) NOT NULL,
  target_price NUMERIC(20, 8) NOT NULL,
  stop_loss NUMERIC(20, 8) NOT NULL,
  leverage NUMERIC(5, 2) NOT NULL,
  risk_reward_ratio NUMERIC(5, 2),
  position_size_usd NUMERIC(20, 2),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 시나리오 2: 기존 코드에 리스크 관리 적용

```typescript
// BEFORE: 리스크 관리 없음
export async function executeTrade(params: TradeParams) {
  const order = await exchange.createOrder(params);
  return order;
}

// AFTER: risk-management 통합
import { validateNewPosition } from '@workspace/risk-management';
import { calculateATRStopLoss } from '@workspace/risk-management';

export async function executeTrade(params: TradeParams) {
  // 1. ATR 계산
  const atr = await calculateATR(params.symbol, 14);
  const stopLoss = calculateATRStopLoss(
    new Big(params.entry),
    atr,
    2.0 // ATR 배수
  );
  
  // 2. 리스크 검증
  const validation = await validateNewPosition({
    symbol: params.symbol,
    side: params.side,
    entry: new Big(params.entry),
    target: new Big(params.target),
    stopLoss: stopLoss.stopLoss,
    leverage: new Big(params.leverage),
  });
  
  if (!validation.approved) {
    throw new Error(
      `Trade rejected: ${validation.violations.join(', ')}`
    );
  }
  
  // 3. 주문 실행
  const order = await exchange.createOrder({
    ...params,
    stopLoss: stopLoss.stopLoss.toString(),
  });
  
  // 4. 리스크 스냅샷 저장
  await saveRiskSnapshot({
    symbol: params.symbol,
    entryPrice: params.entry,
    stopLoss: stopLoss.stopLoss.toString(),
    atr: atr.toString(),
    atrMultiple: 2.0,
  });
  
  return order;
}
```

## 스킬 조합 가이드

### 최적 조합 패턴

| 작업 | 사용 스킬 조합 | 순서 |
|------|--------------|------|
| 차트 분석 → 코드 생성 | `technical-analyst` + `coding-standards` | 1→2 |
| 신호 검증 → DB 저장 | `risk-management` + `database-operations` | 1→2 |
| API 통합 → 리스크 적용 | `external-api-integration` + `risk-management` | 1→2 |
| 전체 플로우 | `technical-analyst` → `risk-management` → `coding-standards` → `database-operations` | 순차 |

### 안티패턴 ❌

```
❌ 나쁜 예:
"BTC 거래 시스템을 만들어줘"
→ 너무 광범위, 어떤 스킬 사용할지 불명확

✅ 좋은 예:
"1. technical-analyst로 BTC 차트 분석
 2. risk-management로 포지션 사이징 계산
 3. coding-standards 지켜서 TypeScript 구현
 4. database-operations로 스키마 설계"
→ 명확한 단계별 스킬 활용
```

## DB 스키마 통합

### 신규 테이블

```sql
-- 1. 트레이딩 신호
CREATE TABLE trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_price NUMERIC(20, 8),
  target_price NUMERIC(20, 8),
  stop_loss NUMERIC(20, 8),
  confidence NUMERIC(3, 2), -- 0.00 ~ 1.00
  analysis_method TEXT, -- 'elliott_wave', 'fibonacci', etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 리스크 이벤트
CREATE TABLE risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  symbol TEXT,
  violation_details JSONB,
  portfolio_value NUMERIC(20, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 일일 P&L
CREATE TABLE daily_pnl (
  date DATE PRIMARY KEY,
  opening_value NUMERIC(20, 2),
  closing_value NUMERIC(20, 2),
  realized_pnl NUMERIC(20, 2) DEFAULT 0,
  circuit_breaker_triggered BOOLEAN DEFAULT FALSE
);

-- 4. 포지션 리스크 스냅샷
CREATE TABLE position_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  entry_price NUMERIC(20, 8),
  stop_loss NUMERIC(20, 8),
  atr NUMERIC(20, 8),
  atr_multiple NUMERIC(5, 2),
  leverage NUMERIC(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 환경 변수

```bash
# .env
# 리스크 관리
DAILY_LOSS_LIMIT_PERCENT=0.05  # 5%
COOLDOWN_MINUTES=60
MAX_PORTFOLIO_LEVERAGE=1.0

# API Keys (향후 stock-screening 스킬용)
FMP_API_KEY=your_fmp_key  # Financial Modeling Prep
FINVIZ_API_KEY=your_finviz_key  # Optional
```

## 다음 단계

### Phase 2 (예정)
- [ ] `market-analysis` 스킬 추가
- [ ] `stock-screening` 스킬 추가
- [ ] `backtest-framework` 스킬 추가

### Phase 3 (예정)
- [ ] `signal-generation` 스킬 추가
- [ ] `performance-analytics` 스킬 추가
- [ ] `compliance-logging` 스킬 추가

### 실전 적용
- [ ] `packages/risk-engine` 패키지 생성
- [ ] `services/signal-generator` 서비스 생성
- [ ] `services/backtest-engine` 서비스 생성
- [ ] 통합 테스트 작성

## 피드백 & 기여

통합 과정에서 발견한 이슈나 개선 제안은 GitHub Issues에 등록해주세요.

**관련 링크:**
- [INTEGRATION_PLAN.md](./INTEGRATION_PLAN.md) - 전체 통합 계획
- [AGENTS.md](./AGENTS.md) - 기존 시스템 구조
- [README.md](./README.md) - 프로젝트 개요
