---
name: risk-management
description: 포지션 사이징, ATR 손절매, 일일 손실 한도, 레버리지 제한. "리스크 관리", "포지션 계산" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 2.0.0
  category: trading-execution
  priority: critical
  sources:
    - jmanhype/qts/risk_manager.py (Python → TypeScript)
---

# Risk Management

jmanhype QTS의 검증된 리스크 관리 로직 (TypeScript 포팅)

## 핵심 원칙

### 다층 리스크 제어
```
Layer 1: 심볼별 레버리지 캡
Layer 2: 포트폴리오 총 레버리지 제한
Layer 3: 포지션 사이징 한도
Layer 4: ATR 기반 동적 손절매
Layer 5: 일일 손실 한도 & 서킷브레이커
```

## 레버리지 규칙

- BTC/ETH: 최대 1.5x
- 알트코인: 최대 1.2x
- 포트폴리오 전체: 최대 1.0x

## 포지션 사이징

- 심볼당 최대: 포트폴리오의 25%
- 총 노출: 포트폴리오의 100%
- 기본 리스크: 거래당 2%

## ATR 기반 손절매

- ATR 배수: 2.0 (기본값)
- 최소 손절: 0.5%
- 최대 손절: 5.0%
- 자동 범위 조정

## 일일 손실 한도

- 한도: -5%
- 도달 시: 모든 포지션 자동 청산
- 쿨다운: 60분
- DB 로깅: risk_events 테이블

## 리스크/보상 비율

- 최소 R/R: 1.5
- 검증: 신호 생성 시 자동
- 미충족 시: 거래 거부

## TypeScript 구현

상세 코드 예제는 `examples/` 참고:
- `risk-calculator.ts`: 포지션 사이징
- `atr-stop-loss.ts`: 동적 손절매
- `circuit-breaker.ts`: 일일 한도 체크

## DB 스키마

```sql
CREATE TABLE risk_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL,
  symbol TEXT,
  violation_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 참고 문서

- `references/position-sizing.md`: Kelly Criterion
- `references/atr-calculation.md`: ATR 상세
- `references/leverage-rules.md`: 레버리지 근거

## 구현 위치

**실제 코드 위치:** `services/trade-executor/lib/risk.ts`

**예제 코드:** `.claude/skills/risk-management/examples/`
- `risk-calculator.ts`: 포지션 사이징 계산
- `atr-stop-loss.ts`: ATR 기반 손절매
- `circuit-breaker.ts`: 일일 손실 한도 체크

```typescript
// services/trade-executor/lib/risk.ts
import { validateNewPosition } from './risk-calculator';

const result = await validateNewPosition({
  symbol: 'BTC',
  broker: 'UPBIT',
  market: 'KRW',
  entry: new Big(93000),
  stopLoss: new Big(91500),
  accountSize: new Big(100000),
  currentPositions: [],
  riskPercentage: 0.01,
});

if (!result.approved) {
  console.error('거부:', result.violations);
}
```

---

**통합:** `signal-generation` → `risk-management` → `compliance-logging`
