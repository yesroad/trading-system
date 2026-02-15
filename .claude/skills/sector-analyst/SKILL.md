---
name: sector-analyst
description: 섹터/업종 퍼포먼스 차트 분석, 시장 사이클 기반 로테이션 패턴 식별. "섹터 분석", "로테이션" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: trading-analysis
  priority: high
  sources:
    - tradermonty/claude-trading-skills/sector-analyst
---

# Sector Analyst

시장 사이클 이론 기반 섹터/업종 로테이션 분석

## 시장 사이클 단계

### Early Cycle (초기 사이클)
**리더:** Technology, Consumer Discretionary, Financials
**특징:** 경기 회복 시작, 금리 하락

### Mid Cycle (중기 사이클)
**리더:** Industrials, Materials, Energy
**특징:** 경기 확장, 인플레이션 상승

### Late Cycle (후기 사이클)
**리더:** Energy, Materials, Healthcare
**특징:** 과열, 금리 상승

### Recession (침체)
**리더:** Utilities, Consumer Staples, Healthcare
**특징:** 방어적 포지셔닝, 안전자산 선호

## 분석 방법

### 1주 성과 차트 (전술적)
- 단기 모멘텀 식별
- 급격한 로테이션 포착
- 진입 타이밍 판단

### 1개월 성과 차트 (전략적)
- 중기 트렌드 확인
- 사이클 위치 판단
- 포트폴리오 배분 결정

## 출력 형식

```
## 섹터 분석 (날짜)

### 현재 사이클 위치
[Mid Cycle / Late Cycle 등]

### 리더 섹터 (1주)
1. Technology (+5.2%)
2. Financials (+3.8%)

### 낙오 섹터 (1주)
1. Utilities (-2.1%)
2. Consumer Staples (-1.5%)

### 시나리오

Mid Cycle 지속 (60%):
- 근거: Industrials, Materials 강세
- 전략: 경기민감주 비중 확대

Late Cycle 전환 (30%):
- 트리거: Energy 강세 전환
- 전략: 방어적 포지셔닝 시작
```

## 참고 문서

- `references/sector-rotation-theory.md`: 사이클별 로테이션
- `references/sector-definitions.md`: 11개 섹터 정의
- `references/historical-patterns.md`: 과거 사례

---

**통합:** `market-analysis`와 결합하여 종합 판단
