# CANSLIM 점수 계산 상세

## 1. 가중치 배분

```typescript
const CANSLIM_WEIGHTS = {
  C: 0.19,  // Current Earnings
  A: 0.25,  // Annual Earnings (가장 중요)
  N: 0.19,  // New
  S: 0.19,  // Supply & Demand
  L: 0.13,  // Leader
  I: 0.06,  // Institutional (가장 낮음)
};
```

## 2. 각 항목 점수 계산

### C Score (Current Earnings)
```typescript
function calculateCScore(epsGrowthYoY: number): number {
  if (epsGrowthYoY >= 100) return 100;
  if (epsGrowthYoY >= 50) return 90;
  if (epsGrowthYoY >= 25) return 80;
  if (epsGrowthYoY >= 10) return 60;
  return Math.max(0, (epsGrowthYoY / 25) * 80);
}
```

### A Score (Annual Earnings)
```typescript
function calculateAScore(epsCagr3y: number, roe: number): number {
  let score = 0;

  // EPS CAGR (70%)
  if (epsCagr3y >= 50) score += 70;
  else if (epsCagr3y >= 25) score += 60;
  else score += (epsCagr3y / 25) * 60;

  // ROE (30%)
  if (roe >= 20) score += 30;
  else if (roe >= 15) score += 20;
  else score += (roe / 15) * 20;

  return Math.min(100, score);
}
```

### N Score (New)
```typescript
function calculateNScore(data: {
  near52wHigh: boolean;
  newProduct: boolean;
  newManagement: boolean;
  ipo: boolean;
}): number {
  let score = 0;

  if (data.near52wHigh) score += 40;       // 52주 신고가 근처 (10% 이내)
  if (data.newProduct) score += 30;        // 신제품 출시
  if (data.newManagement) score += 20;     // 신경영진
  if (data.ipo) score += 10;               // IPO (최근 2년 이내)

  return Math.min(100, score);
}
```

### S Score (Supply & Demand)
```typescript
function calculateSScore(data: {
  floatShares: number;        // 유통 주식 수 (백만)
  volumeRatio: number;        // 평균 대비 거래량 비율
  shortInterest: number;      // 공매도 비율
}): number {
  let score = 0;

  // Float Shares (40%)
  if (data.floatShares < 25) score += 40;
  else if (data.floatShares < 50) score += 30;
  else if (data.floatShares < 100) score += 20;
  else score += 10;

  // Volume Ratio (40%)
  if (data.volumeRatio > 3.0) score += 40;
  else if (data.volumeRatio > 2.0) score += 30;
  else if (data.volumeRatio > 1.5) score += 20;
  else score += (data.volumeRatio / 1.5) * 20;

  // Short Interest (20%)
  if (data.shortInterest > 10) score += 20;  // 높은 공매도 = 숏스퀴즈 가능성
  else if (data.shortInterest > 5) score += 10;

  return Math.min(100, score);
}
```

### L Score (Leader)
```typescript
function calculateLScore(data: {
  rsRating: number;           // Relative Strength Rating (0~100)
  priceVs52wHigh: number;     // 52주 최고가 대비 현재가 (%)
  sectorRank: number;         // 섹터 내 순위 (1~N)
  totalStocksInSector: number;
}): number {
  let score = 0;

  // RS Rating (60%)
  score += data.rsRating * 0.6;

  // 52주 최고가 대비 (20%)
  if (data.priceVs52wHigh > 90) score += 20;
  else if (data.priceVs52wHigh > 80) score += 15;
  else score += (data.priceVs52wHigh / 90) * 15;

  // 섹터 내 순위 (20%)
  const rankPercentile = (1 - (data.sectorRank / data.totalStocksInSector)) * 100;
  if (rankPercentile > 90) score += 20;
  else score += (rankPercentile / 90) * 20;

  return Math.min(100, score);
}
```

### I Score (Institutional)
```typescript
function calculateIScore(data: {
  institutionalOwnership: number;  // % (0~100)
  institutionalBuying: number;     // 최근 분기 변화 (%)
  fundQuality: number;             // 우량 펀드 보유 수
}): number {
  let score = 0;

  // Ownership (50%)
  if (data.institutionalOwnership > 80) score += 50;
  else if (data.institutionalOwnership > 60) score += 40;
  else if (data.institutionalOwnership > 40) score += 30;
  else score += (data.institutionalOwnership / 40) * 30;

  // Buying Trend (30%)
  if (data.institutionalBuying > 10) score += 30;
  else if (data.institutionalBuying > 5) score += 20;
  else if (data.institutionalBuying > 0) score += 10;

  // Fund Quality (20%)
  if (data.fundQuality > 10) score += 20;
  else score += (data.fundQuality / 10) * 20;

  return Math.min(100, score);
}
```

## 3. 최종 점수 계산

```typescript
function calculateFinalScore(scores: {
  c: number;
  a: number;
  n: number;
  s: number;
  l: number;
  i: number;
}): number {
  return (
    scores.c * CANSLIM_WEIGHTS.C +
    scores.a * CANSLIM_WEIGHTS.A +
    scores.n * CANSLIM_WEIGHTS.N +
    scores.s * CANSLIM_WEIGHTS.S +
    scores.l * CANSLIM_WEIGHTS.L +
    scores.i * CANSLIM_WEIGHTS.I
  );
}
```

## 4. 등급 부여

| 점수 | 등급 | 의미 |
|------|------|------|
| 90~100 | A+ | 최고 등급 성장주 |
| 80~89 | A | 우수 성장주 |
| 70~79 | B | 양호 성장주 |
| 60~69 | C | 보통 |
| <60 | D | 기준 미달 |

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
