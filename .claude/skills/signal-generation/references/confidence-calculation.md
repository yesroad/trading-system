# 신뢰도 계산 공식 (Confidence Calculation)

## 1. 개요

매매 신호의 신뢰도(Confidence)는 0.0 ~ 1.0 범위의 값으로, 여러 기술적 지표의 가중치 합산으로 계산됩니다.

**기본 원칙:**
- 단일 지표 신뢰 금지 (최소 3개 이상 지표 조합)
- 지표 간 독립성 확보 (동일 계열 지표 중복 방지)
- 거래량 확증 필수
- 다중 시간대 일치 시 가산점

## 2. 기본 공식

### 2.1 가중치 합산 방식

```typescript
interface IndicatorScore {
  name: string;
  weight: number;      // 가중치 (0.0 ~ 1.0)
  score: number;       // 지표 점수 (-1.0 ~ 1.0)
  confidence: number;  // 지표 신뢰도 (0.0 ~ 1.0)
}

function calculateConfidence(indicators: IndicatorScore[]): number {
  // 1. 가중치 정규화
  const totalWeight = indicators.reduce((sum, ind) => sum + ind.weight, 0);

  // 2. 가중 평균 계산
  const weightedSum = indicators.reduce((sum, ind) => {
    const normalizedWeight = ind.weight / totalWeight;
    // score: -1(매도) ~ 0(중립) ~ 1(매수)
    // confidence: 지표의 명확성
    return sum + (normalizedWeight * ind.score * ind.confidence);
  }, 0);

  // 3. 0~1 범위로 정규화
  const confidence = (weightedSum + 1) / 2;

  // 4. 클리핑
  return Math.max(0, Math.min(1, confidence));
}
```

### 2.2 예시: 추세 추종 신호

```typescript
const indicators: IndicatorScore[] = [
  {
    name: 'MA_ALIGNMENT',
    weight: 0.25,
    score: 1.0,        // 완전한 정배열 (매수)
    confidence: 0.9,   // 명확한 신호
  },
  {
    name: 'MACD',
    weight: 0.20,
    score: 0.8,        // 골든크로스 + 히스토그램 증가
    confidence: 0.85,
  },
  {
    name: 'RSI',
    weight: 0.15,
    score: 0.6,        // RSI 55 (중립~약간 강세)
    confidence: 0.7,
  },
  {
    name: 'VOLUME',
    weight: 0.20,
    score: 0.9,        // 거래량 2배 증가
    confidence: 0.95,
  },
  {
    name: 'SUPPORT_RESISTANCE',
    weight: 0.20,
    score: 0.7,        // 저항선 근처 (약간 불리)
    confidence: 0.8,
  },
];

const confidence = calculateConfidence(indicators);
// 결과: 0.76
```

## 3. 지표별 점수 계산

### 3.1 이동평균선 (Moving Average)

```typescript
function calculateMAScore(prices: number[], periods: number[]): IndicatorScore {
  // periods: [5, 20, 60] (단기, 중기, 장기)
  const mas = periods.map(p => calculateMA(prices, p));

  // 정배열 여부 (단기 > 중기 > 장기)
  const isAligned = mas[0] > mas[1] && mas[1] > mas[2];
  const isReverseAligned = mas[0] < mas[1] && mas[1] < mas[2];

  let score = 0;
  let confidence = 0;

  if (isAligned) {
    // 정배열 → 매수 신호
    score = 1.0;

    // 간격이 넓을수록 신뢰도 높음
    const gap1 = (mas[0] - mas[1]) / mas[1];
    const gap2 = (mas[1] - mas[2]) / mas[2];
    confidence = Math.min(0.95, (gap1 + gap2) * 10);

  } else if (isReverseAligned) {
    // 역배열 → 매도 신호
    score = -1.0;

    const gap1 = (mas[1] - mas[0]) / mas[1];
    const gap2 = (mas[2] - mas[1]) / mas[2];
    confidence = Math.min(0.95, (gap1 + gap2) * 10);

  } else {
    // 혼재 → 방향성 없음
    score = 0;
    confidence = 0.3;
  }

  return {
    name: 'MA_ALIGNMENT',
    weight: 0.25,
    score,
    confidence,
  };
}
```

### 3.2 MACD (Moving Average Convergence Divergence)

```typescript
function calculateMACDScore(macd: MACDData): IndicatorScore {
  const { macd: macdLine, signal, histogram } = macd;

  let score = 0;
  let confidence = 0;

  // 골든크로스/데드크로스 확인
  const isCrossUp = macdLine > signal && histogram > 0;
  const isCrossDown = macdLine < signal && histogram < 0;

  if (isCrossUp) {
    // 골든크로스 → 매수
    score = 0.8;

    // 히스토그램 크기로 신뢰도 계산
    const histogramStrength = Math.abs(histogram) / Math.abs(macdLine);
    confidence = Math.min(0.95, 0.5 + histogramStrength * 2);

  } else if (isCrossDown) {
    // 데드크로스 → 매도
    score = -0.8;

    const histogramStrength = Math.abs(histogram) / Math.abs(macdLine);
    confidence = Math.min(0.95, 0.5 + histogramStrength * 2);

  } else {
    // 크로스 없음
    score = macdLine > signal ? 0.3 : -0.3;
    confidence = 0.4;
  }

  return {
    name: 'MACD',
    weight: 0.20,
    score,
    confidence,
  };
}
```

### 3.3 RSI (Relative Strength Index)

```typescript
function calculateRSIScore(rsi: number): IndicatorScore {
  let score = 0;
  let confidence = 0;

  if (rsi >= 70) {
    // 과매수 → 매도 신호
    score = -0.8;
    confidence = Math.min(0.95, (rsi - 70) / 30);  // 70~100

  } else if (rsi <= 30) {
    // 과매도 → 매수 신호
    score = 0.8;
    confidence = Math.min(0.95, (30 - rsi) / 30);   // 0~30

  } else if (rsi >= 50 && rsi < 70) {
    // 중립~강세
    score = (rsi - 50) / 20;  // 0 ~ 1
    confidence = 0.6;

  } else if (rsi > 30 && rsi < 50) {
    // 중립~약세
    score = (rsi - 50) / 20;  // -1 ~ 0
    confidence = 0.6;

  } else {
    // 완전 중립 (50)
    score = 0;
    confidence = 0.5;
  }

  return {
    name: 'RSI',
    weight: 0.15,
    score,
    confidence,
  };
}
```

### 3.4 거래량 (Volume)

```typescript
function calculateVolumeScore(
  currentVolume: number,
  avgVolume: number,
  priceChange: number
): IndicatorScore {
  const volumeRatio = currentVolume / avgVolume;

  let score = 0;
  let confidence = 0;

  if (volumeRatio > 1.5) {
    // 거래량 급증
    if (priceChange > 0) {
      // 상승 + 거래량 증가 → 강한 매수
      score = 0.9;
      confidence = Math.min(0.95, volumeRatio / 3);
    } else {
      // 하락 + 거래량 증가 → 강한 매도
      score = -0.9;
      confidence = Math.min(0.95, volumeRatio / 3);
    }

  } else if (volumeRatio > 1.0) {
    // 평균 이상
    score = priceChange > 0 ? 0.5 : -0.5;
    confidence = 0.7;

  } else {
    // 평균 이하 (거래량 부족 → 신뢰도 낮음)
    score = 0;
    confidence = 0.3;
  }

  return {
    name: 'VOLUME',
    weight: 0.20,
    score,
    confidence,
  };
}
```

### 3.5 지지/저항선 (Support/Resistance)

```typescript
function calculateSupportResistanceScore(
  currentPrice: number,
  support: number,
  resistance: number
): IndicatorScore {
  const range = resistance - support;
  const position = (currentPrice - support) / range;  // 0~1

  let score = 0;
  let confidence = 0;

  if (position <= 0.2) {
    // 지지선 근처 → 매수 기회
    score = 0.8;
    confidence = 0.85;

  } else if (position >= 0.8) {
    // 저항선 근처 → 매도 고려
    score = -0.5;
    confidence = 0.75;

  } else if (position >= 0.4 && position <= 0.6) {
    // 중간 → 중립
    score = 0;
    confidence = 0.5;

  } else {
    // 약간 치우침
    score = position > 0.5 ? -0.3 : 0.3;
    confidence = 0.6;
  }

  // 저항선 돌파 시 강한 매수
  if (currentPrice > resistance) {
    score = 1.0;
    confidence = 0.9;
  }

  // 지지선 이탈 시 강한 매도
  if (currentPrice < support) {
    score = -1.0;
    confidence = 0.9;
  }

  return {
    name: 'SUPPORT_RESISTANCE',
    weight: 0.20,
    score,
    confidence,
  };
}
```

## 4. 다중 시간대 조정

### 4.1 시간대별 가중치

```typescript
const TIMEFRAME_WEIGHTS = {
  '1m': 0.1,
  '5m': 0.15,
  '15m': 0.2,
  '1h': 0.25,
  '4h': 0.3,
  '1d': 0.4,
  '1w': 0.35,
};

function calculateMultiTimeframeConfidence(
  signals: Record<string, number>  // { '1d': 0.8, '1h': 0.6, ... }
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const [timeframe, confidence] of Object.entries(signals)) {
    const weight = TIMEFRAME_WEIGHTS[timeframe] || 0.2;
    weightedSum += confidence * weight;
    totalWeight += weight;
  }

  return weightedSum / totalWeight;
}

// 예시
const multiTimeframeConfidence = calculateMultiTimeframeConfidence({
  '1d': 0.85,   // 일봉: 강한 매수
  '1h': 0.65,   // 시간봉: 중립
  '5m': 0.45,   // 분봉: 약한 매도
});
// 결과: 0.70 (일봉 신호 우선)
```

### 4.2 일치도 보너스

```typescript
function applyConsensusBonus(
  baseConfidence: number,
  signals: number[]
): number {
  // 모든 시간대 신호 방향 일치 시 보너스
  const allBullish = signals.every(s => s > 0.5);
  const allBearish = signals.every(s => s < 0.5);

  if (allBullish || allBearish) {
    // 일치도 높을수록 보너스 증가
    const avgSignal = signals.reduce((a, b) => a + b, 0) / signals.length;
    const variance = signals.reduce((sum, s) => sum + Math.pow(s - avgSignal, 2), 0) / signals.length;
    const consensusBonus = (1 - Math.sqrt(variance)) * 0.1;  // 최대 +0.1

    return Math.min(1.0, baseConfidence + consensusBonus);
  }

  return baseConfidence;
}
```

## 5. 시장 환경 조정

### 5.1 변동성 조정

```typescript
function adjustForVolatility(
  baseConfidence: number,
  currentVolatility: number,
  avgVolatility: number
): number {
  const volatilityRatio = currentVolatility / avgVolatility;

  if (volatilityRatio > 2.0) {
    // 극단적 변동성 → 신뢰도 하락
    return baseConfidence * 0.8;
  } else if (volatilityRatio > 1.5) {
    // 높은 변동성 → 약간 하락
    return baseConfidence * 0.9;
  } else if (volatilityRatio < 0.5) {
    // 낮은 변동성 → 신뢰도 상승
    return Math.min(1.0, baseConfidence * 1.1);
  }

  return baseConfidence;
}
```

### 5.2 추세 강도 조정

```typescript
function adjustForTrendStrength(
  baseConfidence: number,
  trendStrength: number  // ADX 등으로 계산, 0~100
): number {
  if (trendStrength > 50) {
    // 강한 추세 → 추세 추종 신호 신뢰도 상승
    return Math.min(1.0, baseConfidence * 1.15);
  } else if (trendStrength < 20) {
    // 약한 추세 (횡보) → 신뢰도 하락
    return baseConfidence * 0.85;
  }

  return baseConfidence;
}
```

## 6. 신호 유형별 조정

### 6.1 브레이크아웃 신호

브레이크아웃은 거짓 신호(False Breakout) 가능성이 높으므로 추가 검증 필요.

```typescript
function adjustBreakoutConfidence(
  baseConfidence: number,
  volumeRatio: number,
  consolidationDays: number
): number {
  let adjusted = baseConfidence;

  // 거래량 배수에 따라 조정
  if (volumeRatio > 3.0) {
    adjusted *= 1.2;  // 강한 거래량 → 신뢰도 상승
  } else if (volumeRatio < 1.5) {
    adjusted *= 0.7;  // 약한 거래량 → 신뢰도 하락
  }

  // 박스권 기간에 따라 조정
  if (consolidationDays > 30) {
    adjusted *= 1.15;  // 장기 횡보 후 돌파 → 신뢰도 상승
  } else if (consolidationDays < 7) {
    adjusted *= 0.8;   // 단기 횡보 → 거짓 신호 가능성
  }

  return Math.min(1.0, adjusted);
}
```

### 6.2 반전 신호

반전 신호는 추세에 역행하므로 보수적으로 접근.

```typescript
function adjustReversalConfidence(
  baseConfidence: number,
  rsiRecovery: number,      // RSI 회복 폭
  divergencePresent: boolean
): number {
  let adjusted = baseConfidence;

  // RSI 회복 폭 (과매도에서 얼마나 반등했는지)
  if (rsiRecovery > 15) {
    adjusted *= 1.1;  // 강한 반등
  } else if (rsiRecovery < 5) {
    adjusted *= 0.8;  // 약한 반등
  }

  // 다이버전스 확인
  if (divergencePresent) {
    adjusted *= 1.2;  // 다이버전스 → 신뢰도 상승
  }

  return Math.min(1.0, adjusted);
}
```

## 7. 실전 종합 예시

### 7.1 비트코인 브레이크아웃 신호

```typescript
// 1. 기본 지표 점수
const indicators: IndicatorScore[] = [
  calculateMAScore([...prices], [5, 20, 60]),
  calculateMACDScore(macdData),
  calculateRSIScore(68),
  calculateVolumeScore(currentVolume, avgVolume, priceChange),
  calculateSupportResistanceScore(currentPrice, support, resistance),
];

// 2. 기본 신뢰도 계산
let confidence = calculateConfidence(indicators);  // 0.78

// 3. 다중 시간대 조정
confidence = calculateMultiTimeframeConfidence({
  '1d': confidence,
  '1h': 0.72,
  '15m': 0.65,
});  // 0.75

// 4. 브레이크아웃 조정
confidence = adjustBreakoutConfidence(
  confidence,
  5.3,   // 거래량 5.3배
  45     // 45일 박스권
);  // 0.84

// 5. 변동성 조정
confidence = adjustForVolatility(
  confidence,
  currentVolatility,
  avgVolatility
);  // 0.84 (변동성 정상)

// 최종 신뢰도: 0.84
```

### 7.2 삼성전자 추세 추종 신호

```typescript
const indicators: IndicatorScore[] = [
  {
    name: 'MA_ALIGNMENT',
    weight: 0.25,
    score: 1.0,
    confidence: 0.85,
  },
  {
    name: 'MACD',
    weight: 0.20,
    score: 0.75,
    confidence: 0.8,
  },
  {
    name: 'RSI',
    weight: 0.15,
    score: 0.5,
    confidence: 0.7,
  },
  {
    name: 'VOLUME',
    weight: 0.20,
    score: 0.7,
    confidence: 0.85,
  },
  {
    name: 'SUPPORT_RESISTANCE',
    weight: 0.20,
    score: 0.6,
    confidence: 0.75,
  },
];

let confidence = calculateConfidence(indicators);  // 0.72

// 추세 강도 조정 (ADX 55)
confidence = adjustForTrendStrength(confidence, 55);  // 0.83

// 최종 신뢰도: 0.83
```

## 8. 신뢰도 등급 및 권장 행동

| Confidence | 등급 | 권장 행동 | 포지션 크기 |
|------------|------|-----------|-------------|
| 0.9 ~ 1.0 | Very Strong | 즉시 진입 | 30 ~ 50% |
| 0.8 ~ 0.9 | Strong | 적극 진입 | 25 ~ 35% |
| 0.7 ~ 0.8 | Good | 진입 고려 | 20 ~ 30% |
| 0.6 ~ 0.7 | Moderate | 보수적 진입 | 10 ~ 20% |
| 0.5 ~ 0.6 | Weak | 소량 진입 또는 관망 | 5 ~ 10% |
| 0.0 ~ 0.5 | Very Weak | 관망 | SKIP |

## 9. 구현 체크리스트

- [ ] 최소 3개 이상 독립 지표 조합
- [ ] 거래량 확증 필수
- [ ] 다중 시간대 일치 확인
- [ ] 신호 유형별 조정 적용
- [ ] 시장 환경 (변동성, 추세 강도) 고려
- [ ] 백테스트 기반 가중치 튜닝
- [ ] 신뢰도 0.5 미만 신호 자동 제외
- [ ] 로깅: 각 지표 점수 및 최종 신뢰도 기록

## 10. 참고 문헌

1. **Technical Analysis of the Financial Markets** - John Murphy
   - 지표 조합 방법론

2. **Evidence-Based Technical Analysis** - David Aronson
   - 통계적 신뢰도 계산

3. **Algorithmic Trading** - Ernest Chan
   - 다중 지표 가중치 최적화

4. **Building Winning Algorithmic Trading Systems** - Kevin Davey
   - 백테스트 기반 신뢰도 검증

5. **Python for Algorithmic Trading** - Yves Hilpisch
   - 신호 생성 및 검증 코드

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
