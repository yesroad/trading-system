# CANSLIM 방법론 (William O'Neil)

## 1. 개요

CANSLIM은 William O'Neil이 개발한 **성장주 발굴 시스템**으로, 7가지 핵심 기준의 조합입니다.

## 2. 7가지 기준

### C: Current Quarterly Earnings (당기 분기 실적)
- **기준:** EPS 전년 동기 대비 +25% 이상
- **가중치:** 19%

### A: Annual Earnings Growth (연간 실적 성장)
- **기준:** 최근 3년 연평균 EPS 성장률 +25% 이상
- **가중치:** 25%

### N: New (신규 요소)
- **기준:** 신제품, 신경영진, 신고가 돌파
- **가중치:** 19%

### S: Supply & Demand (수급)
- **기준:** 유통 주식 수 적음(<50M), 거래량 급증
- **가중치:** 19%

### L: Leader or Laggard (선도주 vs 후행주)
- **기준:** Relative Strength (RS) Rating > 80
- **가중치:** 13%

### I: Institutional Sponsorship (기관 지원)
- **기준:** 기관 보유 비율 증가, 우량 기관 편입
- **가중치:** 6%

### M: Market Direction (시장 방향)
- **기준:** 전체 시장 상승 추세 여부
- **가중치:** 없음 (필터)

## 3. 구현 예시

```typescript
interface CANSLIMScore {
  symbol: string;
  c_score: number;  // 0~100
  a_score: number;
  n_score: number;
  s_score: number;
  l_score: number;
  i_score: number;
  total_score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D';
}

function calculateCANSLIM(stock: any): CANSLIMScore {
  const c = stock.eps_growth_yoy > 25 ? 100 : (stock.eps_growth_yoy / 25) * 100;
  const a = stock.eps_cagr_3y > 25 ? 100 : (stock.eps_cagr_3y / 25) * 100;
  const n = stock.near_52w_high && stock.new_product ? 100 : 50;
  const s = stock.float < 50e6 && stock.volume_ratio > 1.5 ? 100 : 50;
  const l = stock.rs_rating;
  const i = stock.institutional_ownership > 60 ? 100 : stock.institutional_ownership * 1.67;

  const total = (c * 0.19) + (a * 0.25) + (n * 0.19) + (s * 0.19) + (l * 0.13) + (i * 0.06);

  let grade: 'A+' | 'A' | 'B' | 'C' | 'D' = 'D';
  if (total > 90) grade = 'A+';
  else if (total > 80) grade = 'A';
  else if (total > 70) grade = 'B';
  else if (total > 60) grade = 'C';

  return { symbol: stock.symbol, c_score: c, a_score: a, n_score: n, s_score: s, l_score: l, i_score: i, total_score: total, grade };
}
```

## 4. 참고 문헌

1. **How to Make Money in Stocks** - William O'Neil
2. **24 Essential Lessons for Investment Success** - William O'Neil
3. **Investor's Business Daily** - 실시간 CANSLIM 스크리닝

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
