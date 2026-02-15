---
name: compliance-logging
description: ACE (Aspiration-Capability-Execution) 프레임워크 기반 트레이딩 로깅. "ACE 로그", "거래 기록" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: compliance
  priority: high
  sources:
    - jmanhype/qts ACE logging framework
---

# Compliance Logging

jmanhype ACE 프레임워크 기반 거래 추적

## ACE 구조

### A - Aspiration (목표)
```json
{
  "strategy": "Elliott Wave 5파동 조정",
  "targetProfit": "5%",
  "maxLoss": "2%",
  "timeHorizon": "3일"
}
```

### C - Capability (능력)
```json
{
  "signals": [
    {
      "type": "technical",
      "method": "Elliott Wave",
      "confidence": 0.65
    }
  ],
  "marketAnalysis": {
    "breadth": "Narrowing",
    "sectorMomentum": "Mixed"
  },
  "riskAssessment": {
    "rr_ratio": 2.1,
    "leverage": 1.5
  }
}
```

### E - Execution (실행)
```json
{
  "decision": "BUY",
  "actualEntry": 93000,
  "actualTarget": 98000,
  "actualStopLoss": 91500,
  "size": 0.1,
  "timestamp": "2026-02-15T10:30:00Z",
  "reason": "모든 리스크 체크 통과"
}
```

## DB 스키마

```sql
CREATE TABLE ace_logs (
  id UUID PRIMARY KEY,
  aspiration JSONB NOT NULL,
  capability JSONB NOT NULL,
  execution JSONB NOT NULL,
  outcome JSONB,          -- 사후 결과
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 사용 예시

```typescript
import { logACE } from '@workspace/compliance-logging';

await logACE({
  aspiration: {
    strategy: 'Elliott Wave reversal',
    targetProfit: '5%',
  },
  capability: {
    signals: [technicalSignal],
    riskAssessment: validationResult,
  },
  execution: {
    decision: 'BUY',
    actualEntry: signal.entry,
    reason: 'All checks passed',
  },
});
```

## 활용

### 성과 분석
- 전략별 승률 계산
- 실패 패턴 식별

### 규정 준수
- 거래 근거 추적
- 감사 대응 자료

## 참고 문서

- `references/ace-framework.md`: ACE 철학
- `references/outcome-analysis.md`: 사후 분석 방법

---

**통합:** 모든 거래에 자동 로깅
