---
name: canslim-screener
description: William O'Neil CANSLIM 방법론 기반 성장주 스크리닝. "CANSLIM", "성장주 발굴" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 2.0.0 (Phase 2 - 6/7 components)
  category: stock-screening
  priority: high
  sources:
    - tradermonty/canslim-screener
  api_requirements:
    - FMP API (free tier OK)
    - Finviz web scraping (institutional data)
---

# CANSLIM Stock Screener

William O'Neil의 검증된 성장주 발굴 방법론

## CANSLIM 구성 (Phase 2: 6/7)

### C - Current Earnings (19%)
EPS 성장률 25%+ (QoQ, YoY)

### A - Annual Growth (25%)
연간 EPS 성장 25%+ (3년 평균)

### N - New Highs (19%)
신고가 근접 (52주 최고가의 85%+)

### S - Supply/Demand (19%)
거래량 기반 매집/분산 분석
- Up Day Volume > Down Day Volume

### I - Institutional Sponsorship (13%)
Finviz 웹 스크래핑으로 기관 보유 분석
- 보유 기관 수 증가
- 보유 비율 50-80% (과도한 보유 제외)

### M - Market Direction (6%)
시장 전체 방향 (S&P 500 추세)
- Bear Market 시 "현금 보유" 경고

**Phase 3 예정:** L - Leadership (RS Rating)

## 점수 체계

- 90-100: Exceptional+ (즉시 매수 검토)
- 80-89: Exceptional
- 70-79: Strong
- 60-69: Above Average

## 사용 예시

```
"CANSLIM으로 미국 성장주 40개 스크리닝해줘"

→ 결과:
Top 10 (90점 이상)
1. NVDA - 95점 (C:100, A:95, N:100, S:90, I:85, M:100)
2. META - 92점 ...
```

## 참고 문서

- `references/canslim-methodology.md`: O'Neil 원문 방법론
- `references/scoring-formula.md`: 점수 계산 상세
- `references/portfolio-rules.md`: 포트폴리오 구성 규칙

---

**API:** FMP (무료 OK) + Finviz 스크래핑
**실행 시간:** 40개 종목 약 1분 40초
