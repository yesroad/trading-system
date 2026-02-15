---
name: signal-generation
description: 기술적 분석 결과를 실제 매매 신호로 변환. "신호 생성", "매매 신호" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: trading-execution
  priority: critical
  sources:
    - jmanhype/qts signal generation logic
---

# Signal Generation

기술적 분석 → 검증된 매매 신호 변환

## 신호 구조

```typescript
interface TradingSignal {
  type: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  entry: string;         // 진입가
  target: string;        // 목표가
  stopLoss: string;      // 손절가
  confidence: number;    // 0.0-1.0
  reason: string;        // 근거
  indicators: {
    rsi?: number;
    macd?: object;
    volume?: object;
  };
  timestamp: string;
}
```

## 생성 프로세스

### 1. 분석 입력
- `technical-analyst`: 차트 분석 결과
- `market-analysis`: 시장 상태
- `sector-analyst`: 섹터 모멘텀

### 2. 신호 계산
```typescript
const signal = {
  type: analysis.scenario === 'bullish' ? 'BUY' : 'SELL',
  entry: currentPrice,
  target: analysis.target,
  stopLoss: calculateATRStopLoss(entry, atr),
  confidence: analysis.probability,
};
```

### 3. 리스크 검증
```typescript
const validation = await validateNewPosition(signal);
if (!validation.approved) {
  return null; // 신호 거부
}
```

## 신뢰도 등급

- **High (0.8-1.0):** 다중 지표 일치, 강한 모멘텀
- **Medium (0.6-0.8):** 일부 지표 일치
- **Low (0.4-0.6):** 약한 신호, 관망 권장
- **Very Low (<0.4):** 신호 생성 안 함

## 필터링 규칙

### 자동 거부 조건
- R/R < 1.5
- Confidence < 0.4
- 일일 손실 한도 도달
- 시장 방향 반대 (M component)

## 사용 예시

```typescript
import { generateSignal } from '@workspace/signal-generation';
import { analyzeTechnical } from '@workspace/technical-analyst';

const analysis = await analyzeTechnical('BTC', chartData);
const signal = await generateSignal(analysis);

if (signal) {
  console.log('신호 생성:', signal.type, signal.confidence);
  await executeTrade(signal);
}
```

## 참고 문서

- `references/signal-types.md`: 신호 유형별 특징
- `references/confidence-calculation.md`: 신뢰도 계산

---

**워크플로우:**
`technical-analyst` → `signal-generation` → `risk-management` → `trade-executor`
