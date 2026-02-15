---
name: market-analysis
description: 시장 breadth, 뉴스 임팩트 분석 통합. "시장 분석", "breadth", "뉴스 영향" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: trading-analysis
  priority: high
  sources:
    - tradermonty/breadth-chart-analyst
    - tradermonty/market-news-analyst
---

# Market Analysis

Breadth 지표 + 뉴스 임팩트 종합 분석

## Breadth 분석

### S&P 500 Breadth Index
- **Healthy Breadth (80%+):** 광범위 상승
- **Narrowing Breadth (50-80%):** 시장 약화
- **Distribution (<50%):** 하락 신호

### Uptrend Stock Ratio
- **Strong Market (>60%):** 강세장
- **Mixed Market (40-60%):** 중립
- **Weak Market (<40%):** 약세장

## 뉴스 임팩트 스코어링

### 점수 = 가격영향 × 확산범위 × 지속성

**High Impact (8-10):**
- FOMC 금리 결정
- 빅테크 어닝 서프라이즈
- 지정학적 위기

**Medium Impact (5-7):**
- 경제지표 (CPI, NFP)
- 섹터별 뉴스

**Low Impact (1-4):**
- 개별 기업 뉴스
- 소규모 이벤트

## 출력 형식

```
## 시장 분석 (날짜)

### Breadth 상태
- S&P 500 Breadth: 75% (Narrowing)
- Uptrend Ratio: 55% (Mixed)

### 최근 10일 주요 뉴스
1. FOMC 금리 동결 (임팩트: 9/10)
   - 효과: S&P +2.5%
2. NVDA 어닝 비트 (임팩트: 7/10)
   - 효과: Tech +3.8%

### 시장 전망
- 단기 (1-2주): 중립
- 중기 (1-3개월): 약세 경계
```

## 참고 문서

- `references/breadth-indicators.md`: 지표 해석
- `references/news-scoring.md`: 임팩트 점수 계산
- `references/event-correlations.md`: 이벤트-가격 상관관계

---

**통합:** `sector-analyst` + `technical-analyst`와 결합
