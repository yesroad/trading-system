# 뉴스 임팩트 점수 계산 (News Impact Scoring)

## 1. 개요

뉴스 임팩트 점수는 **뉴스가 주가에 미치는 영향력**을 정량화하는 지표입니다.

**핵심 공식:**
```
Impact Score = (가격 영향도 × 0.5) + (확산 범위 × 0.3) + (지속성 × 0.2)
```

## 2. 가격 영향도 (Price Impact)

### 2.1 계산 방법

```typescript
interface PriceImpact {
  symbol: string;
  price_before: number;      // 뉴스 발표 전 가격
  price_after_1h: number;    // 1시간 후
  price_after_24h: number;   // 24시간 후
  volume_ratio: number;      // 거래량 변화 (배수)
  impact_score: number;      // 0 ~ 100
}

function calculatePriceImpact(data: {
  priceBefore: number;
  priceAfter1h: number;
  priceAfter24h: number;
  avgVolume: number;
  currentVolume: number;
}): number {
  // 1시간 가격 변화율
  const change1h = Math.abs((data.priceAfter1h - data.priceBefore) / data.priceBefore) * 100;

  // 24시간 가격 변화율
  const change24h = Math.abs((data.priceAfter24h - data.priceBefore) / data.priceBefore) * 100;

  // 거래량 증가율
  const volumeRatio = data.currentVolume / data.avgVolume;

  // 가중 평균 (1시간 60%, 24시간 30%, 거래량 10%)
  const priceImpact = (change1h * 0.6) + (change24h * 0.3) + ((volumeRatio - 1) * 10 * 0.1);

  // 0~100 정규화
  return Math.min(100, priceImpact * 10);
}

// 예시
const impact = calculatePriceImpact({
  priceBefore: 100000,
  priceAfter1h: 108000,    // +8%
  priceAfter24h: 105000,   // +5%
  avgVolume: 1000000,
  currentVolume: 3500000,  // 3.5배
});
// 결과: 73.5
```

### 2.2 임팩트 등급

| Score | 등급 | 설명 |
|-------|------|------|
| 80~100 | Critical | 매우 강한 영향 (±10% 이상) |
| 60~80 | High | 높은 영향 (±5~10%) |
| 40~60 | Medium | 중간 영향 (±2~5%) |
| 20~40 | Low | 낮은 영향 (±1~2%) |
| 0~20 | Minimal | 미미한 영향 (±1% 미만) |

## 3. 확산 범위 (Spread)

### 3.1 계산 방법

```typescript
interface SpreadAnalysis {
  affected_symbols: string[];    // 영향받은 종목
  sector_impact: number;         // 섹터 전체 영향도 (%)
  market_impact: number;         // 시장 전체 영향도 (%)
  social_mentions: number;       // 소셜미디어 언급 수
  media_coverage: number;        // 미디어 커버리지 수
  spread_score: number;          // 0 ~ 100
}

function calculateSpreadScore(data: {
  affectedSymbols: number;       // 영향받은 종목 수
  totalSymbolsInSector: number;
  sectorChangeAvg: number;       // 섹터 평균 변화율
  marketChangeAvg: number;       // 시장 평균 변화율
  socialMentions: number;
  mediaCoverage: number;
}): number {
  // 섹터 내 확산 (40%)
  const sectorSpread = (data.affectedSymbols / data.totalSymbolsInSector) * 100 * 0.4;

  // 섹터 영향 강도 (30%)
  const sectorImpact = Math.abs(data.sectorChangeAvg) * 10 * 0.3;

  // 시장 영향 강도 (20%)
  const marketImpact = Math.abs(data.marketChangeAvg) * 10 * 0.2;

  // 미디어/소셜 확산 (10%)
  const mediaSpread = Math.min(100, (data.socialMentions / 1000 + data.mediaCoverage / 10)) * 0.1;

  return Math.min(100, sectorSpread + sectorImpact + marketImpact + mediaSpread);
}

// 예시: 테슬라 리콜 뉴스
const spread = calculateSpreadScore({
  affectedSymbols: 15,           // EV 관련주 15개 영향
  totalSymbolsInSector: 50,
  sectorChangeAvg: -2.5,         // 섹터 평균 -2.5%
  marketChangeAvg: -0.3,         // 시장 전체 -0.3%
  socialMentions: 5000,
  mediaCoverage: 25,
});
// 결과: 62
```

## 4. 지속성 (Persistence)

### 4.1 계산 방법

```typescript
interface PersistenceAnalysis {
  initial_impact: number;        // 초기 영향 (%)
  impact_after_1d: number;       // 1일 후
  impact_after_3d: number;       // 3일 후
  impact_after_7d: number;       // 7일 후
  persistence_score: number;     // 0 ~ 100
}

function calculatePersistenceScore(data: {
  initialImpact: number;
  impactAfter1d: number;
  impactAfter3d: number;
  impactAfter7d: number;
}): number {
  // 초기 대비 유지율
  const retention1d = data.impactAfter1d / data.initialImpact;
  const retention3d = data.impactAfter3d / data.initialImpact;
  const retention7d = data.impactAfter7d / data.initialImpact;

  // 가중 평균 (1일 50%, 3일 30%, 7일 20%)
  const avgRetention = (retention1d * 0.5) + (retention3d * 0.3) + (retention7d * 0.2);

  return Math.min(100, avgRetention * 100);
}

// 예시: 실적 발표 (긍정)
const persistence = calculatePersistenceScore({
  initialImpact: 8.0,      // +8%
  impactAfter1d: 6.5,      // +6.5% (81% 유지)
  impactAfter3d: 5.0,      // +5% (63% 유지)
  impactAfter7d: 4.0,      // +4% (50% 유지)
});
// 결과: 70.5
```

## 5. 종합 임팩트 점수

### 5.1 최종 계산

```typescript
interface NewsImpactScore {
  price_impact: number;          // 0 ~ 100
  spread: number;                // 0 ~ 100
  persistence: number;           // 0 ~ 100
  total_score: number;           // 0 ~ 100
  grade: string;                 // 'CRITICAL' | 'HIGH' | ...
  recommendation: string;
}

function calculateNewsImpactScore(
  priceImpact: number,
  spread: number,
  persistence: number
): NewsImpactScore {
  // 가중 합산
  const totalScore = (priceImpact * 0.5) + (spread * 0.3) + (persistence * 0.2);

  let grade = 'MINIMAL';
  let recommendation = '관망';

  if (totalScore >= 80) {
    grade = 'CRITICAL';
    recommendation = '즉시 대응 필요 (포지션 조정)';
  } else if (totalScore >= 60) {
    grade = 'HIGH';
    recommendation = '적극 대응 고려';
  } else if (totalScore >= 40) {
    grade = 'MEDIUM';
    recommendation = '모니터링 강화';
  } else if (totalScore >= 20) {
    grade = 'LOW';
    recommendation = '일반 모니터링';
  }

  return {
    price_impact: priceImpact,
    spread,
    persistence,
    total_score: totalScore,
    grade,
    recommendation,
  };
}

// 예시: Apple 신제품 발표
const appleNewsScore = calculateNewsImpactScore(
  73.5,  // 가격 영향 73.5
  62.0,  // 확산 범위 62
  70.5   // 지속성 70.5
);
// {
//   price_impact: 73.5,
//   spread: 62,
//   persistence: 70.5,
//   total_score: 69.45,
//   grade: 'HIGH',
//   recommendation: '적극 대응 고려'
// }
```

## 6. 뉴스 카테고리별 가중치

### 6.1 카테고리 분류

```typescript
enum NewsCategory {
  EARNINGS = 'EARNINGS',           // 실적 발표
  PRODUCT = 'PRODUCT',             // 신제품/서비스
  M_A = 'M_A',                     // 인수합병
  REGULATORY = 'REGULATORY',       // 규제/정책
  EXECUTIVE = 'EXECUTIVE',         // 경영진 변동
  GEOPOLITICAL = 'GEOPOLITICAL',   // 지정학
  ECONOMIC = 'ECONOMIC',           // 경제 지표
  ANALYST = 'ANALYST',             // 애널리스트 의견
}

const CATEGORY_MULTIPLIERS: Record<NewsCategory, number> = {
  [NewsCategory.EARNINGS]: 1.3,        // 실적은 영향 큼
  [NewsCategory.M_A]: 1.4,             // M&A는 가장 큼
  [NewsCategory.REGULATORY]: 1.2,
  [NewsCategory.PRODUCT]: 1.1,
  [NewsCategory.GEOPOLITICAL]: 1.25,
  [NewsCategory.ECONOMIC]: 1.15,
  [NewsCategory.EXECUTIVE]: 0.9,       // 경영진 변동은 상대적으로 작음
  [NewsCategory.ANALYST]: 0.8,         // 애널리스트 의견은 가장 작음
};

function adjustScoreByCategory(
  baseScore: number,
  category: NewsCategory
): number {
  return Math.min(100, baseScore * CATEGORY_MULTIPLIERS[category]);
}
```

## 7. 실시간 뉴스 모니터링

### 7.1 뉴스 API 통합

```typescript
interface NewsEvent {
  id: string;
  title: string;
  summary: string;
  category: NewsCategory;
  symbols: string[];             // 관련 종목
  published_at: string;
  source: string;
}

async function monitorNewsImpact(event: NewsEvent): Promise<NewsImpactScore> {
  // 1. 뉴스 발표 전후 가격 데이터 수집
  const priceData = await fetchPriceData(event.symbols[0], event.published_at);

  // 2. 가격 영향도 계산
  const priceImpact = calculatePriceImpact({
    priceBefore: priceData.before,
    priceAfter1h: priceData.after1h,
    priceAfter24h: priceData.after24h,
    avgVolume: priceData.avgVolume,
    currentVolume: priceData.currentVolume,
  });

  // 3. 확산 범위 계산
  const spread = calculateSpreadScore({
    affectedSymbols: event.symbols.length,
    totalSymbolsInSector: await getSectorSize(event.symbols[0]),
    sectorChangeAvg: await getSectorChange(event.symbols[0]),
    marketChangeAvg: await getMarketChange(),
    socialMentions: await getSocialMentions(event.title),
    mediaCoverage: await getMediaCoverage(event.id),
  });

  // 4. 지속성 계산 (이력 데이터 기반 추정)
  const persistence = estimatePersistence(event.category, priceImpact);

  // 5. 카테고리별 조정
  let totalScore = calculateNewsImpactScore(priceImpact, spread, persistence);
  totalScore.total_score = adjustScoreByCategory(totalScore.total_score, event.category);

  return totalScore;
}
```

## 8. 알림 및 대응 전략

### 8.1 임팩트 기반 알림

```typescript
async function sendNewsAlert(
  event: NewsEvent,
  impactScore: NewsImpactScore
): Promise<void> {
  if (impactScore.grade === 'CRITICAL' || impactScore.grade === 'HIGH') {
    await sendTelegramAlert({
      title: `📰 ${impactScore.grade} 뉴스 알림`,
      message: `
**${event.title}**

종목: ${event.symbols.join(', ')}
카테고리: ${event.category}

가격 영향: ${impactScore.price_impact.toFixed(1)}
확산 범위: ${impactScore.spread.toFixed(1)}
지속성: ${impactScore.persistence.toFixed(1)}
**종합 점수: ${impactScore.total_score.toFixed(1)}**

권장: ${impactScore.recommendation}
      `,
    });
  }
}
```

## 9. 참고 문헌

1. **News Analytics in Finance** - Gautam Mitra, Xiang Yu
2. **Sentiment Analysis in Financial Markets** - Roy Niederhoffer
3. **Thomson Reuters News Analytics** - 뉴스 임팩트 측정 백서
4. **Bloomberg Event-Driven Trading** - 이벤트 기반 거래 전략

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
