---
name: risk-management
description: 트레이딩 리스크 관리 - 포지션 사이징, 레버리지 제한, ATR 기반 손절매, 일일 손실 한도. "리스크 관리", "포지션 계산", "손절매", "레버리지" 요청 시 사용.
user-invocable: true
disable-model-invocation: false
metadata:
  author: yesroad
  version: 1.0.0
  category: trading-execution
  priority: critical
  sources:
    - jmanhype/qts/risk_manager.py (Python → TypeScript 포팅)
---

# Risk Management

jmanhype QTS의 검증된 리스크 관리 로직을 TypeScript로 포팅

## 핵심 원칙

### 1. 다층 리스크 제어
```
Layer 1: 심볼별 레버리지 캡
Layer 2: 포트폴리오 총 레버리지 제한
Layer 3: 포지션 사이징 한도
Layer 4: ATR 기반 동적 손절매
Layer 5: 일일 손실 한도 & 서킷브레이커
```

## TypeScript 구현

### 레버리지 관리

```typescript
import Big from 'big.js';

interface LeverageRules {
  readonly [symbol: string]: Big;
  readonly DEFAULT: Big;
  readonly PORTFOLIO_MAX: Big;
}

export const LEVERAGE_CAPS: LeverageRules = {
  BTC: new Big(1.5),
  ETH: new Big(1.5),
  DEFAULT: new Big(1.2),
  PORTFOLIO_MAX: new Big(1.0),
} as const;

export function validateLeverage(
  symbol: string,
  requestedLeverage: Big
): { allowed: boolean; max: Big; reason?: string } {
  const maxLeverage = LEVERAGE_CAPS[symbol] || LEVERAGE_CAPS.DEFAULT;

  if (requestedLeverage.gt(maxLeverage)) {
    return {
      allowed: false,
      max: maxLeverage,
      reason: `Leverage ${requestedLeverage} exceeds max ${maxLeverage} for ${symbol}`,
    };
  }

  return { allowed: true, max: maxLeverage };
}

export function calculatePortfolioLeverage(
  positions: Array<{ symbol: string; notional: Big }>
): Big {
  const totalNotional = positions.reduce(
    (sum, pos) => sum.plus(pos.notional),
    new Big(0)
  );

  return totalNotional.div(getPortfolioValue());
}
```

### 포지션 사이징

```typescript
interface PositionLimits {
  readonly MAX_PER_SYMBOL: Big;
  readonly MAX_GROSS_NOTIONAL: Big;
}

export const POSITION_LIMITS: PositionLimits = {
  MAX_PER_SYMBOL: new Big(0.25), // 25% of portfolio
  MAX_GROSS_NOTIONAL: new Big(1.0), // 100% of portfolio
} as const;

export function calculatePositionSize(
  symbol: string,
  portfolioValue: Big,
  riskPercent: Big = new Big(0.02) // 2% default
): { size: Big; reason: string } {
  // 1. 심볼별 최대 노출
  const maxSymbolExposure = portfolioValue.times(POSITION_LIMITS.MAX_PER_SYMBOL);

  // 2. 리스크 기반 계산
  const riskAmount = portfolioValue.times(riskPercent);

  // 3. 현재 포지션 체크
  const currentPositions = getCurrentPositions();
  const currentNotional = currentPositions.reduce(
    (sum, pos) => sum.plus(pos.notional),
    new Big(0)
  );

  const availableCapital = portfolioValue
    .times(POSITION_LIMITS.MAX_GROSS_NOTIONAL)
    .minus(currentNotional);

  // 4. 최소값 선택
  const proposedSize = Big.min(maxSymbolExposure, riskAmount, availableCapital);

  if (proposedSize.lte(0)) {
    return {
      size: new Big(0),
      reason: 'No available capital - portfolio fully allocated',
    };
  }

  return {
    size: proposedSize,
    reason: `Position size: ${proposedSize.toFixed(2)} (${proposedSize
      .div(portfolioValue)
      .times(100)
      .toFixed(1)}% of portfolio)`,
  };
}
```

### ATR 기반 동적 손절매

```typescript
interface StopLossResult {
  stopLoss: Big;
  percent: Big;
  atrMultiple: number;
  bounded: boolean;
}

export function calculateATRStopLoss(
  entryPrice: Big,
  atr: Big,
  multiplier: number = 2.0
): StopLossResult {
  // ATR 기반 손절가 계산
  const atrStop = entryPrice.minus(atr.times(multiplier));
  const atrPercent = entryPrice.minus(atrStop).div(entryPrice);

  // 0.5% ~ 5% 범위 제한
  const MIN_STOP_PERCENT = new Big(0.005);
  const MAX_STOP_PERCENT = new Big(0.05);

  const minStopPrice = entryPrice.times(new Big(1).minus(MAX_STOP_PERCENT));
  const maxStopPrice = entryPrice.times(new Big(1).minus(MIN_STOP_PERCENT));

  let finalStop = atrStop;
  let bounded = false;

  // 하한 체크 (손절이 너무 가까움)
  if (finalStop.gt(maxStopPrice)) {
    finalStop = maxStopPrice;
    bounded = true;
  }

  // 상한 체크 (손절이 너무 멀음)
  if (finalStop.lt(minStopPrice)) {
    finalStop = minStopPrice;
    bounded = true;
  }

  const finalPercent = entryPrice.minus(finalStop).div(entryPrice);

  return {
    stopLoss: finalStop,
    percent: finalPercent,
    atrMultiple: multiplier,
    bounded,
  };
}
```

### 일일 손실 한도 & 서킷브레이커

```typescript
interface DailyLossConfig {
  readonly MAX_DAILY_LOSS_PERCENT: Big;
  readonly COOLDOWN_MINUTES: number;
}

export const DAILY_LOSS_CONFIG: DailyLossConfig = {
  MAX_DAILY_LOSS_PERCENT: new Big(0.05), // -5%
  COOLDOWN_MINUTES: 60,
} as const;

interface CircuitBreakerState {
  triggered: boolean;
  reason?: string;
  cooldownUntil?: Date;
}

export async function checkDailyLossLimit(): Promise<CircuitBreakerState> {
  const todayPnL = await getTodayPnL();
  const portfolioValue = await getPortfolioValue();
  const lossPercent = todayPnL.div(portfolioValue);

  // -5% 도달 체크
  if (lossPercent.lte(DAILY_LOSS_CONFIG.MAX_DAILY_LOSS_PERCENT.neg())) {
    // 모든 포지션 청산
    await closeAllPositions('Daily loss limit breached');

    // 쿨다운 설정
    const cooldownUntil = new Date(
      Date.now() + DAILY_LOSS_CONFIG.COOLDOWN_MINUTES * 60 * 1000
    );

    // DB에 이벤트 로깅
    await logRiskEvent({
      type: 'CIRCUIT_BREAKER',
      reason: `Daily loss ${lossPercent.times(100).toFixed(2)}% exceeds -5% limit`,
      pnl: todayPnL.toString(),
      portfolioValue: portfolioValue.toString(),
      cooldownUntil: cooldownUntil.toISOString(),
    });

    return {
      triggered: true,
      reason: `Daily loss limit breached: ${lossPercent
        .times(100)
        .toFixed(2)}%`,
      cooldownUntil,
    };
  }

  return { triggered: false };
}
```

### 리스크/보상 비율 검증

```typescript
interface RiskRewardRatio {
  ratio: Big;
  valid: boolean;
  reason?: string;
}

export function validateRiskReward(
  entry: Big,
  target: Big,
  stopLoss: Big,
  minRatio: Big = new Big(1.5)
): RiskRewardRatio {
  const reward = target.minus(entry).abs();
  const risk = entry.minus(stopLoss).abs();

  if (risk.lte(0)) {
    return {
      ratio: new Big(0),
      valid: false,
      reason: 'Invalid stop loss - no risk defined',
    };
  }

  const ratio = reward.div(risk);

  if (ratio.lt(minRatio)) {
    return {
      ratio,
      valid: false,
      reason: `Risk/Reward ${ratio.toFixed(2)} < minimum ${minRatio}`,
    };
  }

  return {
    ratio,
    valid: true,
  };
}
```

## 통합 워크플로우

### 신규 포지션 진입 체크리스트

```typescript
export async function validateNewPosition(params: {
  symbol: string;
  side: 'long' | 'short';
  entry: Big;
  target: Big;
  stopLoss: Big;
  leverage: Big;
}): Promise<{ approved: boolean; violations: string[] }> {
  const violations: string[] = [];

  // 1. 레버리지 체크
  const leverageCheck = validateLeverage(params.symbol, params.leverage);
  if (!leverageCheck.allowed) {
    violations.push(leverageCheck.reason!);
  }

  // 2. 포트폴리오 레버리지 체크
  const portfolioLeverage = await calculatePortfolioLeverage(
    await getCurrentPositions()
  );
  if (portfolioLeverage.gte(LEVERAGE_CAPS.PORTFOLIO_MAX)) {
    violations.push(
      `Portfolio leverage ${portfolioLeverage.toFixed(
        2
      )}x exceeds max ${LEVERAGE_CAPS.PORTFOLIO_MAX}`
    );
  }

  // 3. 리스크/보상 비율 체크
  const rrCheck = validateRiskReward(params.entry, params.target, params.stopLoss);
  if (!rrCheck.valid) {
    violations.push(rrCheck.reason!);
  }

  // 4. 일일 손실 한도 체크
  const circuitBreaker = await checkDailyLossLimit();
  if (circuitBreaker.triggered) {
    violations.push(circuitBreaker.reason!);
  }

  // 5. 포지션 사이징 체크
  const portfolioValue = await getPortfolioValue();
  const sizing = calculatePositionSize(params.symbol, portfolioValue);
  if (sizing.size.lte(0)) {
    violations.push(sizing.reason);
  }

  return {
    approved: violations.length === 0,
    violations,
  };
}
```

## DB 스키마

```sql
-- 리스크 이벤트 로깅
CREATE TABLE risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'LEVERAGE_VIOLATION', 'CIRCUIT_BREAKER', 'POSITION_LIMIT', etc.
  symbol TEXT,
  violation_details JSONB NOT NULL,
  portfolio_value NUMERIC(20, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 일일 손실 추적
CREATE TABLE daily_pnl (
  date DATE PRIMARY KEY,
  opening_value NUMERIC(20, 2) NOT NULL,
  closing_value NUMERIC(20, 2),
  realized_pnl NUMERIC(20, 2) DEFAULT 0,
  unrealized_pnl NUMERIC(20, 2) DEFAULT 0,
  loss_limit_triggered BOOLEAN DEFAULT FALSE,
  circuit_breaker_until TIMESTAMPTZ
);

-- 포지션 리스크 스냅샷
CREATE TABLE position_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  entry_price NUMERIC(20, 8) NOT NULL,
  stop_loss NUMERIC(20, 8) NOT NULL,
  atr NUMERIC(20, 8),
  atr_multiple NUMERIC(5, 2),
  risk_percent NUMERIC(5, 4),
  size_usd NUMERIC(20, 2),
  leverage NUMERIC(5, 2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 사용 예시

```typescript
// 매매 신호 검증
const signal = {
  symbol: 'BTC',
  side: 'long',
  entry: new Big(93000),
  target: new Big(98000),
  stopLoss: new Big(91500),
  leverage: new Big(1.5),
};

const validation = await validateNewPosition(signal);

if (!validation.approved) {
  console.error('Position rejected:', validation.violations);
  // ACE 로깅
  await logACE({
    aspiration: { strategy: 'Elliott Wave reversal' },
    capability: { signals: [signal] },
    execution: {
      decision: 'SKIP',
      reason: validation.violations.join(', '),
    },
  });
}
```

## 참고 문서

- `references/position-sizing.md`: Kelly Criterion 등 고급 사이징
- `references/atr-stop-loss.md`: ATR 계산 상세
- `references/drawdown-management.md`: 최대낙폭 관리 전략

---

**통합 포인트:**
- `signal-generation` → 신호 생성 후 이 스킬로 검증
- `compliance-logging` → ACE 로그에 리스크 판단 기록
- `backtest-framework` → 백테스트 시 동일 룰 적용
