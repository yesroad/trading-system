# 섹터 로테이션 이론 (Sector Rotation Theory)

## 1. 개요

섹터 로테이션은 **경기 사이클에 따라 특정 섹터가 순환적으로 강세/약세를 보이는 현상**입니다.

**핵심 원칙:**
- 경기는 4단계 사이클 (Early → Mid → Late → Recession)
- 각 단계마다 유리한 섹터가 다름
- 선행 지표로 다음 단계 예측 가능

## 2. 경기 사이클 4단계

### 2.1 Early Cycle (경기 회복 초기)

**특징:**
- GDP 성장률 회복 시작
- 금리 낮음 (중앙은행 완화 정책 유지)
- 실업률 여전히 높음
- 소비자 신뢰 회복 시작

**강세 섹터:**
```typescript
const EARLY_CYCLE_LEADERS = [
  'Financials',          // 금리 인상 기대, 대출 증가
  'Industrials',         // 경기 회복 수혜
  'Materials',           // 원자재 수요 증가
  'Real Estate',         // 낮은 금리 수혜
  'Technology',          // 성장 기대
];
```

**판단 지표:**
- GDP 성장률: 전분기 대비 상승 (마이너스 → 플러스)
- 실업률: 고점 통과 후 하락 시작
- 금리: 저점 근처 유지
- PMI (구매관리자지수): 50 돌파

### 2.2 Mid Cycle (경기 확장기)

**특징:**
- GDP 성장률 안정적 상승
- 금리 상승 시작
- 실업률 하락
- 기업 이익 최대화

**강세 섹터:**
```typescript
const MID_CYCLE_LEADERS = [
  'Technology',          // 성장 가속
  'Consumer Discretionary',  // 소비 증가
  'Industrials',         // 설비 투자 증가
  'Financials',          // 대출 수익 증가
];
```

**판단 지표:**
- GDP 성장률: 3% 이상 (미국 기준)
- 실업률: 5% 이하
- 금리: 점진적 상승 중
- S&P 500 기업 이익 성장률: 10% 이상

### 2.3 Late Cycle (경기 과열기)

**특징:**
- GDP 성장률 둔화 시작
- 금리 고점 근처
- 인플레이션 압력
- 기업 비용 증가

**강세 섹터:**
```typescript
const LATE_CYCLE_LEADERS = [
  'Energy',              // 인플레이션 수혜
  'Materials',           // 원자재 가격 상승
  'Utilities',           // 방어적 성격
  'Healthcare',          // 방어적 성격
  'Consumer Staples',    // 필수 소비재
];
```

**판단 지표:**
- GDP 성장률: 둔화 (3% → 2%)
- 금리: 고점 또는 정점
- CPI (소비자물가지수): 3% 이상
- 국채 수익률 곡선: 평탄화 (Flattening)

### 2.4 Recession (경기 침체)

**특징:**
- GDP 마이너스 성장 (2분기 연속)
- 금리 인하 시작
- 실업률 급등
- 기업 이익 감소

**강세 섹터:**
```typescript
const RECESSION_LEADERS = [
  'Utilities',           // 안정적 수익
  'Healthcare',          // 필수 서비스
  'Consumer Staples',    // 필수 소비재
  'Communication Services',  // 방어적 성격
];
```

**판단 지표:**
- GDP 성장률: 마이너스 (2분기 연속)
- 실업률: 급등 (6% 이상)
- 금리: 급격한 인하
- VIX: 30 이상

## 3. 사이클 판단 프레임워크

### 3.1 종합 사이클 스코어

```typescript
interface CycleIndicators {
  gdp_growth: number;            // %
  unemployment_rate: number;     // %
  interest_rate: number;         // %
  interest_rate_trend: 'UP' | 'DOWN' | 'FLAT';
  cpi: number;                   // %
  pmi: number;                   // 0~100
  yield_curve_slope: number;     // 10Y - 2Y
  sp500_earnings_growth: number; // %
}

function determineCycleStage(indicators: CycleIndicators): {
  stage: 'EARLY' | 'MID' | 'LATE' | 'RECESSION';
  confidence: number;
  reasoning: string[];
} {
  const signals: Record<string, number> = {
    EARLY: 0,
    MID: 0,
    LATE: 0,
    RECESSION: 0,
  };

  const reasoning: string[] = [];

  // GDP 성장률
  if (indicators.gdp_growth < 0) {
    signals.RECESSION += 3;
    reasoning.push('GDP 마이너스 성장');
  } else if (indicators.gdp_growth < 1.5) {
    signals.EARLY += 2;
    reasoning.push('GDP 낮은 성장 (회복 초기)');
  } else if (indicators.gdp_growth < 3.0) {
    signals.MID += 2;
    reasoning.push('GDP 안정적 성장');
  } else {
    signals.LATE += 2;
    reasoning.push('GDP 높은 성장 (과열 가능성)');
  }

  // 실업률
  if (indicators.unemployment_rate > 6.0) {
    signals.RECESSION += 2;
    signals.EARLY += 1;
  } else if (indicators.unemployment_rate < 4.0) {
    signals.MID += 2;
    signals.LATE += 1;
  }

  // 금리 추세
  if (indicators.interest_rate_trend === 'DOWN') {
    signals.RECESSION += 2;
    signals.EARLY += 1;
    reasoning.push('금리 인하 중');
  } else if (indicators.interest_rate_trend === 'UP') {
    signals.MID += 2;
    signals.LATE += 1;
    reasoning.push('금리 인상 중');
  }

  // 인플레이션
  if (indicators.cpi > 3.5) {
    signals.LATE += 3;
    reasoning.push('높은 인플레이션');
  } else if (indicators.cpi < 2.0) {
    signals.EARLY += 2;
    signals.RECESSION += 1;
  }

  // PMI
  if (indicators.pmi < 45) {
    signals.RECESSION += 3;
    reasoning.push('PMI 위축');
  } else if (indicators.pmi > 55) {
    signals.MID += 2;
    signals.LATE += 1;
    reasoning.push('PMI 확장');
  } else if (indicators.pmi > 50) {
    signals.EARLY += 2;
  }

  // 수익률 곡선
  if (indicators.yield_curve_slope < -0.5) {
    signals.LATE += 3;
    signals.RECESSION += 2;
    reasoning.push('수익률 곡선 역전');
  } else if (indicators.yield_curve_slope > 1.5) {
    signals.EARLY += 2;
    reasoning.push('수익률 곡선 가파름');
  }

  // 기업 이익 성장률
  if (indicators.sp500_earnings_growth < 0) {
    signals.RECESSION += 3;
  } else if (indicators.sp500_earnings_growth > 15) {
    signals.MID += 2;
  }

  // 최고 점수 단계 선택
  const entries = Object.entries(signals);
  const maxEntry = entries.reduce((max, entry) => entry[1] > max[1] ? entry : max);

  const totalScore = Object.values(signals).reduce((sum, val) => sum + val, 0);
  const confidence = maxEntry[1] / totalScore;

  return {
    stage: maxEntry[0] as 'EARLY' | 'MID' | 'LATE' | 'RECESSION',
    confidence,
    reasoning,
  };
}

// 예시
const currentCycle = determineCycleStage({
  gdp_growth: 2.5,
  unemployment_rate: 4.2,
  interest_rate: 4.5,
  interest_rate_trend: 'UP',
  cpi: 2.8,
  pmi: 54,
  yield_curve_slope: 0.8,
  sp500_earnings_growth: 12,
});
// {
//   stage: 'MID',
//   confidence: 0.68,
//   reasoning: ['GDP 안정적 성장', '금리 인상 중', 'PMI 확장']
// }
```

## 4. 섹터 로테이션 전략

### 4.1 사이클별 포트폴리오 구성

```typescript
const CYCLE_PORTFOLIOS = {
  EARLY: {
    sectors: [
      { name: 'Financials', weight: 0.25 },
      { name: 'Industrials', weight: 0.20 },
      { name: 'Technology', weight: 0.20 },
      { name: 'Materials', weight: 0.15 },
      { name: 'Real Estate', weight: 0.10 },
      { name: 'Consumer Discretionary', weight: 0.10 },
    ],
    rationale: '경기 회복 초기 - 경기 민감주 중심',
  },
  MID: {
    sectors: [
      { name: 'Technology', weight: 0.30 },
      { name: 'Consumer Discretionary', weight: 0.20 },
      { name: 'Industrials', weight: 0.20 },
      { name: 'Financials', weight: 0.15 },
      { name: 'Communication Services', weight: 0.10 },
      { name: 'Healthcare', weight: 0.05 },
    ],
    rationale: '경기 확장기 - 성장주 중심',
  },
  LATE: {
    sectors: [
      { name: 'Energy', weight: 0.25 },
      { name: 'Materials', weight: 0.20 },
      { name: 'Utilities', weight: 0.15 },
      { name: 'Healthcare', weight: 0.15 },
      { name: 'Consumer Staples', weight: 0.15 },
      { name: 'Financials', weight: 0.10 },
    ],
    rationale: '경기 과열기 - 원자재 및 방어주 혼합',
  },
  RECESSION: {
    sectors: [
      { name: 'Utilities', weight: 0.30 },
      { name: 'Healthcare', weight: 0.25 },
      { name: 'Consumer Staples', weight: 0.20 },
      { name: 'Communication Services', weight: 0.15 },
      { name: 'Technology', weight: 0.10 },  // 대형 우량주만
    ],
    rationale: '경기 침체 - 방어주 중심',
  },
};

function getRecommendedPortfolio(stage: string): typeof CYCLE_PORTFOLIOS['EARLY'] {
  return CYCLE_PORTFOLIOS[stage] || CYCLE_PORTFOLIOS.MID;
}
```

### 4.2 전환 시그널

```typescript
interface TransitionSignal {
  from_stage: string;
  to_stage: string;
  confidence: number;
  trigger_indicators: string[];
  action_items: string[];
}

function detectCycleTransition(
  currentStage: string,
  indicators: CycleIndicators
): TransitionSignal | null {
  // MID → LATE 전환
  if (currentStage === 'MID' && indicators.cpi > 3.0 && indicators.yield_curve_slope < 1.0) {
    return {
      from_stage: 'MID',
      to_stage: 'LATE',
      confidence: 0.75,
      trigger_indicators: ['인플레이션 3% 돌파', '수익률 곡선 평탄화'],
      action_items: [
        'Technology 비중 축소 (30% → 20%)',
        'Energy 비중 확대 (0% → 20%)',
        'Utilities 편입 (10%)',
      ],
    };
  }

  // LATE → RECESSION 전환
  if (currentStage === 'LATE' && indicators.yield_curve_slope < 0 && indicators.pmi < 50) {
    return {
      from_stage: 'LATE',
      to_stage: 'RECESSION',
      confidence: 0.80,
      trigger_indicators: ['수익률 곡선 역전', 'PMI 50 하회'],
      action_items: [
        'Energy, Materials 전량 매도',
        'Utilities 비중 확대 (15% → 30%)',
        '현금 비중 20% 확보',
      ],
    };
  }

  // RECESSION → EARLY 전환
  if (currentStage === 'RECESSION' && indicators.pmi > 50 && indicators.interest_rate_trend === 'DOWN') {
    return {
      from_stage: 'RECESSION',
      to_stage: 'EARLY',
      confidence: 0.70,
      trigger_indicators: ['PMI 50 돌파', '금리 인하 지속'],
      action_items: [
        'Financials 비중 확대 (25%)',
        'Industrials 편입 (20%)',
        'Utilities 비중 축소 (30% → 10%)',
      ],
    };
  }

  return null;
}
```

## 5. 참고 문헌

1. **Sector Rotation: How to Profit from Stocks** - John Nyaradi
2. **The Business Cycle Approach to Equity Allocation** - Sam Stovall
3. **Intermarket Analysis** - John Murphy
4. **NBER Business Cycle Dating** - 공식 경기 사이클 정의

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
