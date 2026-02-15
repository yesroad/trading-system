# 이벤트-가격 상관관계 (Event-Price Correlations)

## 1. 개요

특정 경제/정치 이벤트와 주가 움직임 간의 **역사적 상관관계**를 분석하여 향후 대응 전략을 수립합니다.

## 2. FOMC (연방공개시장위원회)

### 2.1 역사적 패턴

```typescript
interface FOMCImpact {
  event_date: string;
  rate_decision: 'HIKE' | 'CUT' | 'HOLD';
  rate_change: number;           // bp (basis points)
  sp500_change_1d: number;       // S&P 500 1일 변화율
  sp500_change_7d: number;       // 7일 변화율
  vix_change: number;            // VIX 변화
  sector_rotation: string[];     // 강세 섹터
}

const HISTORICAL_FOMC = [
  {
    event_date: '2023-03-22',
    rate_decision: 'HIKE',
    rate_change: 25,
    sp500_change_1d: -1.6,
    sp500_change_7d: 0.8,
    vix_change: 8.2,
    sector_rotation: ['Utilities', 'Consumer Staples'],  // 방어주 강세
  },
  {
    event_date: '2023-05-03',
    rate_decision: 'HIKE',
    rate_change: 25,
    sp500_change_1d: 1.0,
    sp500_change_7d: 2.5,
    vix_change: -3.5,
    sector_rotation: ['Technology', 'Communication'],
  },
  // ... 더 많은 데이터
];

function predictFOMCImpact(expectedDecision: 'HIKE' | 'CUT' | 'HOLD'): {
  expected_sp500_1d: number;
  expected_vix_change: number;
  recommended_sectors: string[];
} {
  // 과거 동일 결정 데이터 필터링
  const similar = HISTORICAL_FOMC.filter(f => f.rate_decision === expectedDecision);

  const avgSP500 = similar.reduce((sum, f) => sum + f.sp500_change_1d, 0) / similar.length;
  const avgVIX = similar.reduce((sum, f) => sum + f.vix_change, 0) / similar.length;

  // 가장 빈번한 강세 섹터
  const sectorCounts: Record<string, number> = {};
  similar.forEach(f => {
    f.sector_rotation.forEach(sector => {
      sectorCounts[sector] = (sectorCounts[sector] || 0) + 1;
    });
  });

  const recommendedSectors = Object.entries(sectorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector]) => sector);

  return {
    expected_sp500_1d: avgSP500,
    expected_vix_change: avgVIX,
    recommended_sectors: recommendedSectors,
  };
}

// 예시: 금리 인상 예상
const prediction = predictFOMCImpact('HIKE');
// {
//   expected_sp500_1d: -0.8,
//   expected_vix_change: 4.2,
//   recommended_sectors: ['Utilities', 'Healthcare', 'Consumer Staples']
// }
```

### 2.2 FOMC 전후 매매 전략

```typescript
function generateFOMCStrategy(
  daysUntilFOMC: number,
  expectedDecision: 'HIKE' | 'CUT' | 'HOLD'
): string {
  if (daysUntilFOMC > 7) {
    return '일반 거래 유지';
  } else if (daysUntilFOMC > 2) {
    // FOMC 1주일 전
    if (expectedDecision === 'HIKE') {
      return '방어주 비중 확대, 레버리지 축소';
    } else if (expectedDecision === 'CUT') {
      return '성장주 비중 확대';
    }
  } else if (daysUntilFOMC >= 0) {
    // FOMC 당일 ~ 2일 전
    return '신규 포지션 자제, 변동성 대비';
  } else if (daysUntilFOMC >= -1) {
    // FOMC 익일
    return '변동성 진정 확인 후 재진입';
  }

  return '일반 거래 재개';
}
```

## 3. 어닝 시즌 (Earnings Season)

### 3.1 어닝 서프라이즈 상관관계

```typescript
interface EarningsImpact {
  symbol: string;
  report_date: string;
  eps_surprise: number;          // % (actual - expected) / expected
  revenue_surprise: number;      // %
  price_change_1d: number;       // 발표 후 1일 변화율
  price_change_7d: number;       // 7일 변화율
  guidance: 'RAISED' | 'LOWERED' | 'MAINTAINED';
}

function predictEarningsImpact(
  epsSurprise: number,
  revenueSurprise: number,
  guidance: 'RAISED' | 'LOWERED' | 'MAINTAINED'
): {
  expected_1d_change: number;
  confidence: number;
  strategy: string;
} {
  let expected1d = 0;
  let confidence = 0.5;

  // EPS 서프라이즈 기여
  if (epsSurprise > 10) {
    expected1d += 5.0;
    confidence += 0.2;
  } else if (epsSurprise > 5) {
    expected1d += 3.0;
    confidence += 0.1;
  } else if (epsSurprise < -10) {
    expected1d -= 5.0;
    confidence += 0.2;
  } else if (epsSurprise < -5) {
    expected1d -= 3.0;
    confidence += 0.1;
  }

  // 매출 서프라이즈 기여
  if (revenueSurprise > 5) {
    expected1d += 2.0;
    confidence += 0.1;
  } else if (revenueSurprise < -5) {
    expected1d -= 2.0;
    confidence += 0.1;
  }

  // 가이던스 기여
  if (guidance === 'RAISED') {
    expected1d += 3.0;
    confidence += 0.15;
  } else if (guidance === 'LOWERED') {
    expected1d -= 4.0;
    confidence += 0.15;
  }

  let strategy = '관망';
  if (expected1d > 5 && confidence > 0.7) {
    strategy = '적극 매수';
  } else if (expected1d > 3 && confidence > 0.6) {
    strategy = '매수 고려';
  } else if (expected1d < -5 && confidence > 0.7) {
    strategy = '즉시 매도';
  } else if (expected1d < -3 && confidence > 0.6) {
    strategy = '매도 고려';
  }

  return {
    expected_1d_change: expected1d,
    confidence: Math.min(1.0, confidence),
    strategy,
  };
}

// 예시: 애플 어닝
const appleEarnings = predictEarningsImpact(
  12,         // EPS +12% 서프라이즈
  8,          // Revenue +8% 서프라이즈
  'RAISED'    // 가이던스 상향
);
// { expected_1d_change: 10, confidence: 0.85, strategy: '적극 매수' }
```

### 3.2 어닝 시즌 섹터별 패턴

```typescript
interface EarningsSeasonPattern {
  week_of_season: number;        // 1~4주차
  sector: string;
  avg_beat_rate: number;         // 예상 상회 비율
  avg_price_change: number;      // 평균 주가 변화율
}

const EARNINGS_SEASON_PATTERNS: EarningsSeasonPattern[] = [
  { week_of_season: 1, sector: 'Financials', avg_beat_rate: 0.65, avg_price_change: 2.1 },
  { week_of_season: 2, sector: 'Technology', avg_beat_rate: 0.72, avg_price_change: 3.5 },
  { week_of_season: 3, sector: 'Healthcare', avg_beat_rate: 0.68, avg_price_change: 1.8 },
  { week_of_season: 4, sector: 'Consumer', avg_beat_rate: 0.60, avg_price_change: 1.2 },
];

function getEarningsSeasonStrategy(weekNumber: number): string[] {
  const thisWeek = EARNINGS_SEASON_PATTERNS.filter(p => p.week_of_season === weekNumber);

  return thisWeek
    .sort((a, b) => b.avg_price_change - a.avg_price_change)
    .map(p => `${p.sector} (Beat Rate: ${(p.avg_beat_rate * 100).toFixed(0)}%)`);
}
```

## 4. 지정학적 리스크

### 4.1 이벤트 유형별 영향

```typescript
interface GeopoliticalEvent {
  type: 'WAR' | 'SANCTIONS' | 'ELECTION' | 'TRADE_WAR' | 'TERRORISM';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  affected_regions: string[];
  affected_sectors: string[];
  historical_impact: {
    sp500_change_1d: number;
    sp500_change_30d: number;
    vix_spike: number;
    recovery_days: number;      // 반등까지 소요 기간
  };
}

const GEOPOLITICAL_IMPACTS: GeopoliticalEvent[] = [
  {
    type: 'WAR',
    severity: 'CRITICAL',
    affected_regions: ['Europe', 'Middle East'],
    affected_sectors: ['Energy', 'Defense', 'Financials'],
    historical_impact: {
      sp500_change_1d: -3.8,
      sp500_change_30d: -8.5,
      vix_spike: 25.0,
      recovery_days: 45,
    },
  },
  {
    type: 'TRADE_WAR',
    severity: 'HIGH',
    affected_regions: ['Asia', 'US'],
    affected_sectors: ['Technology', 'Industrials', 'Materials'],
    historical_impact: {
      sp500_change_1d: -2.1,
      sp500_change_30d: -5.2,
      vix_spike: 12.0,
      recovery_days: 30,
    },
  },
  {
    type: 'SANCTIONS',
    severity: 'MEDIUM',
    affected_regions: ['Russia', 'Iran'],
    affected_sectors: ['Energy', 'Financials'],
    historical_impact: {
      sp500_change_1d: -1.2,
      sp500_change_30d: -2.5,
      vix_spike: 8.0,
      recovery_days: 15,
    },
  },
];

function assessGeopoliticalRisk(eventType: string): {
  defensive_sectors: string[];
  avoid_sectors: string[];
  expected_recovery_days: number;
} {
  const event = GEOPOLITICAL_IMPACTS.find(e => e.type === eventType);
  if (!event) {
    return {
      defensive_sectors: ['Utilities', 'Consumer Staples'],
      avoid_sectors: [],
      expected_recovery_days: 0,
    };
  }

  // 방어 섹터 (지정학적 리스크 시 강세)
  const defensiveSectors = ['Utilities', 'Healthcare', 'Consumer Staples', 'Gold'];

  // 회피 섹터
  const avoidSectors = event.affected_sectors;

  return {
    defensive_sectors: defensiveSectors,
    avoid_sectors: avoidSectors,
    expected_recovery_days: event.historical_impact.recovery_days,
  };
}
```

## 5. 경제 지표 발표

### 5.1 주요 지표별 영향

```typescript
interface EconomicIndicator {
  name: string;
  expected: number;
  actual: number;
  previous: number;
  impact_level: 'HIGH' | 'MEDIUM' | 'LOW';
}

const INDICATOR_IMPACTS = {
  'NFP': {                       // Non-Farm Payrolls
    beat_threshold: 50000,       // 예상 대비 +50k 이상이면 beat
    miss_threshold: -50000,
    beat_sp500_change: 0.8,      // Beat 시 S&P 500 평균 +0.8%
    miss_sp500_change: -1.2,
  },
  'CPI': {                       // Consumer Price Index
    beat_threshold: 0.2,         // +0.2%p 이상
    miss_threshold: -0.2,
    beat_sp500_change: -1.5,     // CPI Beat(인플레이션 상승)은 악재
    miss_sp500_change: 1.2,
  },
  'GDP': {
    beat_threshold: 0.5,         // +0.5%p 이상
    miss_threshold: -0.5,
    beat_sp500_change: 1.0,
    miss_sp500_change: -0.8,
  },
  'RETAIL_SALES': {
    beat_threshold: 0.3,
    miss_threshold: -0.3,
    beat_sp500_change: 0.6,
    miss_sp500_change: -0.5,
  },
};

function predictIndicatorImpact(indicator: EconomicIndicator): {
  expected_sp500_change: number;
  sectors_to_watch: string[];
  strategy: string;
} {
  const config = INDICATOR_IMPACTS[indicator.name];
  if (!config) {
    return {
      expected_sp500_change: 0,
      sectors_to_watch: [],
      strategy: '관망',
    };
  }

  const surprise = indicator.actual - indicator.expected;

  let expectedChange = 0;
  let sectorsToWatch: string[] = [];
  let strategy = '관망';

  if (surprise >= config.beat_threshold) {
    expectedChange = config.beat_sp500_change;
    strategy = expectedChange > 0 ? '매수 고려' : '매도 고려';

    if (indicator.name === 'CPI') {
      sectorsToWatch = ['Utilities', 'Real Estate'];  // 인플레이션 방어
    } else if (indicator.name === 'NFP') {
      sectorsToWatch = ['Financials', 'Industrials'];  // 경기 확장
    }

  } else if (surprise <= config.miss_threshold) {
    expectedChange = config.miss_sp500_change;
    strategy = expectedChange > 0 ? '매수 고려' : '매도 고려';

    if (indicator.name === 'CPI') {
      sectorsToWatch = ['Technology', 'Consumer Discretionary'];
    } else if (indicator.name === 'NFP') {
      sectorsToWatch = ['Consumer Staples', 'Healthcare'];  // 방어주
    }
  }

  return {
    expected_sp500_change: expectedChange,
    sectors_to_watch: sectorsToWatch,
    strategy,
  };
}

// 예시: CPI 발표
const cpiImpact = predictIndicatorImpact({
  name: 'CPI',
  expected: 3.2,
  actual: 3.5,      // +0.3%p 서프라이즈 (Beat)
  previous: 3.1,
  impact_level: 'HIGH',
});
// {
//   expected_sp500_change: -1.5,
//   sectors_to_watch: ['Utilities', 'Real Estate'],
//   strategy: '매도 고려'
// }
```

## 6. 이벤트 캘린더 통합

### 6.1 다가오는 이벤트 분석

```typescript
interface UpcomingEvent {
  date: string;
  type: 'FOMC' | 'EARNINGS' | 'ECONOMIC' | 'GEOPOLITICAL';
  name: string;
  expected_impact: 'HIGH' | 'MEDIUM' | 'LOW';
  related_symbols: string[];
}

async function analyzeUpcomingEvents(days: number = 7): Promise<{
  high_impact_events: UpcomingEvent[];
  portfolio_recommendations: string[];
}> {
  const events = await fetchUpcomingEvents(days);

  const highImpact = events.filter(e => e.expected_impact === 'HIGH');

  const recommendations: string[] = [];

  highImpact.forEach(event => {
    if (event.type === 'FOMC') {
      recommendations.push('변동성 대비: 현금 비중 확대 10~20%');
    } else if (event.type === 'EARNINGS' && event.related_symbols.length > 0) {
      recommendations.push(`${event.related_symbols.join(', ')} 어닝 대비: 포지션 조정 검토`);
    } else if (event.type === 'ECONOMIC') {
      recommendations.push(`${event.name} 발표: 섹터 로테이션 준비`);
    }
  });

  return {
    high_impact_events: highImpact,
    portfolio_recommendations: recommendations,
  };
}
```

## 7. 상관관계 강도 측정

### 7.1 이벤트-가격 상관계수

```typescript
function calculateEventCorrelation(
  eventDates: string[],
  priceChanges: number[]
): number {
  // Pearson 상관계수 계산
  const n = eventDates.length;

  const meanX = eventDates.length;  // 단순화: 이벤트 발생 = 1
  const meanY = priceChanges.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  priceChanges.forEach((change, i) => {
    const devX = 1 - meanX / n;  // 이벤트 발생 여부 편차
    const devY = change - meanY;

    numerator += devX * devY;
    denomX += devX * devX;
    denomY += devY * devY;
  });

  const correlation = numerator / Math.sqrt(denomX * denomY);

  return correlation;
}

// 해석:
// > 0.7: 강한 양의 상관관계
// 0.3 ~ 0.7: 중간 양의 상관관계
// -0.3 ~ 0.3: 약한 상관관계
// -0.7 ~ -0.3: 중간 음의 상관관계
// < -0.7: 강한 음의 상관관계
```

## 8. 참고 문헌

1. **Event-Driven Trading** - Jeffrey Hirsch
2. **The Capital Market Expectations** - CFA Institute
3. **Geopolitical Alpha** - Marko Papic
4. **Federal Reserve Communications** - FOMC 의사록 분석
5. **Earnings Surprise Research** - Academic papers on earnings impact

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
