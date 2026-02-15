# 매매 신호 유형 및 특징

## 1. 신호 유형 분류

### 1.1 기본 신호 타입

```typescript
enum SignalType {
  BUY = 'BUY',           // 매수 신호
  SELL = 'SELL',         // 매도 신호
  HOLD = 'HOLD',         // 보유 신호
  REDUCE = 'REDUCE',     // 부분 매도
  ADD = 'ADD',           // 추가 매수
  SKIP = 'SKIP',         // 관망
}

enum SignalUrgency {
  IMMEDIATE = 'IMMEDIATE',   // 즉시 실행 (시장가)
  NORMAL = 'NORMAL',         // 일반 (지정가)
  PATIENT = 'PATIENT',       // 유리한 가격 대기
}

interface TradingSignal {
  type: SignalType;
  urgency: SignalUrgency;
  confidence: number;        // 0.0 ~ 1.0
  reasoning: string[];
  entry_price?: number;
  target_price?: number;
  stop_loss?: number;
  position_size?: number;    // 포지션 크기 (%)
  timeframe: string;         // '1m', '5m', '1h', '1d'
  expires_at?: string;       // 신호 유효 기간
}
```

### 1.2 신호 강도 분류

| Confidence | 등급 | 특징 | 권장 포지션 크기 |
|------------|------|------|------------------|
| 0.9 ~ 1.0 | Very Strong | 여러 지표 동시 확증, 명확한 추세 | 30 ~ 50% |
| 0.7 ~ 0.9 | Strong | 주요 지표 확증, 추세 진행 중 | 20 ~ 30% |
| 0.5 ~ 0.7 | Moderate | 일부 지표 확증, 불확실성 존재 | 10 ~ 20% |
| 0.3 ~ 0.5 | Weak | 약한 신호, 확증 부족 | 5 ~ 10% |
| 0.0 ~ 0.3 | Very Weak | 관망 권장 | SKIP |

## 2. 진입 신호 패턴

### 2.1 추세 추종 진입

**조건:**
- 이동평균선 정배열 (단기 > 중기 > 장기)
- MACD 골든크로스
- RSI 40~60 (과매수/과매도 아님)
- 거래량 증가

```typescript
interface TrendFollowingEntry {
  pattern: 'TREND_FOLLOWING';
  ma_alignment: boolean;      // 이동평균 정배열
  macd_cross: 'GOLDEN' | 'DEAD';
  rsi_zone: 'NEUTRAL' | 'OVERBOUGHT' | 'OVERSOLD';
  volume_surge: boolean;      // 평균 대비 1.5배 이상
}

// 예시
const signal: TradingSignal = {
  type: SignalType.BUY,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.75,
  reasoning: [
    '5일/20일/60일 이동평균 정배열',
    'MACD 골든크로스 발생',
    'RSI 52 (중립 구간)',
    '거래량 평균 대비 2.1배 증가',
  ],
  entry_price: 50000,
  target_price: 55000,      // +10% 목표
  stop_loss: 47500,         // -5% 손절
  position_size: 25,        // 25% 투자
  timeframe: '1d',
};
```

### 2.2 반전 진입 (V자 반등)

**조건:**
- 과매도 구간에서 반등 (RSI < 30 → > 40)
- Stochastic 골든크로스
- 거래량 급증
- 지지선 근처

```typescript
interface ReversalEntry {
  pattern: 'REVERSAL';
  oversold_recovery: boolean; // RSI 30 이하에서 반등
  stoch_cross: boolean;
  support_level: number;      // 지지선 가격
  bounce_strength: number;    // 반등 강도 (%)
}

// 예시
const signal: TradingSignal = {
  type: SignalType.BUY,
  urgency: SignalUrgency.IMMEDIATE,  // 빠른 진입 필요
  confidence: 0.68,
  reasoning: [
    'RSI 28 → 43 급반등',
    'Stochastic 골든크로스',
    '52주 최저가 근처 (지지선)',
    '거래량 3배 폭증',
  ],
  entry_price: 48000,
  target_price: 52000,      // +8.3% 목표
  stop_loss: 46500,         // -3.1% 손절 (짧게)
  position_size: 20,
  timeframe: '1h',
};
```

### 2.3 브레이크아웃 진입

**조건:**
- 저항선 돌파 (거래량 동반)
- 볼린저 밴드 상단 돌파
- 거래량 급증
- 주가 신고가 또는 박스권 탈출

```typescript
interface BreakoutEntry {
  pattern: 'BREAKOUT';
  resistance_break: boolean;
  resistance_level: number;
  volume_ratio: number;       // 평균 대비 비율
  consolidation_days: number; // 박스권 기간
}

// 예시
const signal: TradingSignal = {
  type: SignalType.BUY,
  urgency: SignalUrgency.IMMEDIATE,
  confidence: 0.82,
  reasoning: [
    '45일 박스권 상단 55,000원 돌파',
    '거래량 4.2배 폭증',
    '볼린저 밴드 상단 돌파',
    '신고가 갱신',
  ],
  entry_price: 56000,       // 저항선 위
  target_price: 62000,      // +10.7% 목표
  stop_loss: 54000,         // 저항선 아래 (재진입 방지)
  position_size: 30,
  timeframe: '1d',
};
```

## 3. 청산 신호 패턴

### 3.1 목표가 도달

```typescript
interface TargetReached {
  pattern: 'TARGET_REACHED';
  entry_price: number;
  current_price: number;
  gain_pct: number;
  target_level: 'PARTIAL' | 'FULL';  // 부분/전체 청산
}

// 예시: 부분 청산
const signal: TradingSignal = {
  type: SignalType.REDUCE,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.9,
  reasoning: [
    '진입가 대비 +10% 목표가 도달',
    '저항선 근접 (과매수 가능성)',
  ],
  position_size: 50,  // 50% 청산
  timeframe: '1d',
};
```

### 3.2 손절 트리거

```typescript
interface StopLoss {
  pattern: 'STOP_LOSS';
  entry_price: number;
  current_price: number;
  loss_pct: number;
  trigger_type: 'FIXED' | 'TRAILING' | 'ATR';
}

// 예시: 고정 손절
const signal: TradingSignal = {
  type: SignalType.SELL,
  urgency: SignalUrgency.IMMEDIATE,  // 즉시 실행
  confidence: 1.0,
  reasoning: [
    '진입가 대비 -5% 손절선 도달',
    '추세 반전 확인 (MACD 데드크로스)',
  ],
  position_size: 100,  // 전량 청산
  timeframe: '1h',
};
```

### 3.3 추세 반전

```typescript
interface TrendReversal {
  pattern: 'TREND_REVERSAL';
  ma_break: boolean;          // 이동평균선 이탈
  macd_cross: 'DEAD';
  rsi_divergence: boolean;    // RSI 다이버전스
  volume_decline: boolean;    // 거래량 감소
}

// 예시
const signal: TradingSignal = {
  type: SignalType.SELL,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.78,
  reasoning: [
    '20일 이동평균선 하향 돌파',
    'MACD 데드크로스',
    'RSI 베어리시 다이버전스',
    '거래량 지속 감소',
  ],
  position_size: 100,
  timeframe: '1d',
};
```

## 4. 보유 신호

### 4.1 추세 지속

```typescript
const signal: TradingSignal = {
  type: SignalType.HOLD,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.85,
  reasoning: [
    '상승 추세 지속 (이동평균 정배열)',
    'RSI 55 (중립)',
    '목표가 미도달 (+7%)',
    '거래량 안정적',
  ],
  timeframe: '1d',
};
```

### 4.2 박스권 횡보

```typescript
const signal: TradingSignal = {
  type: SignalType.HOLD,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.60,
  reasoning: [
    '52,000 ~ 55,000 박스권 횡보',
    '방향성 불명확',
    '거래량 감소',
    '브레이크아웃 대기',
  ],
  timeframe: '1d',
};
```

## 5. 추가 매수 신호

### 5.1 피라미딩 (Pyramiding)

**조건:**
- 기존 포지션 수익 중
- 추세 강화 확인
- 거래량 증가

```typescript
interface PyramidingSignal {
  pattern: 'PYRAMIDING';
  existing_position: {
    entry_price: number;
    current_gain_pct: number;
    current_size: number;
  };
  add_size: number;  // 추가 매수 크기
}

// 예시
const signal: TradingSignal = {
  type: SignalType.ADD,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.75,
  reasoning: [
    '기존 포지션 +8% 수익',
    '추세 가속 (이동평균 간격 확대)',
    '거래량 지속 증가',
    'MACD 히스토그램 확대',
  ],
  entry_price: 54000,
  position_size: 15,  // 15% 추가 매수
  timeframe: '1d',
};
```

### 5.2 평단가 낮추기 (Averaging Down)

**주의: 하락 추세에서는 위험. 횡보 구간에서만 고려**

```typescript
const signal: TradingSignal = {
  type: SignalType.ADD,
  urgency: SignalUrgency.PATIENT,
  confidence: 0.55,
  reasoning: [
    '기존 포지션 -3% 손실',
    '지지선 근처 (반등 가능성)',
    'RSI 과매도 구간 (28)',
    '단, 추세 반전 미확인 → 소량만 추가',
  ],
  entry_price: 48500,
  position_size: 10,  // 소량만
  timeframe: '1d',
};
```

## 6. 복합 신호

### 6.1 다중 시간대 분석

```typescript
interface MultiTimeframeSignal {
  daily: TradingSignal;    // 일봉
  hourly: TradingSignal;   // 시간봉
  minute: TradingSignal;   // 분봉
  consensus: SignalType;   // 종합 판단
}

// 예시: 상위 시간대 우선
const multiSignal: MultiTimeframeSignal = {
  daily: {
    type: SignalType.BUY,
    confidence: 0.8,
    reasoning: ['장기 상승 추세'],
    timeframe: '1d',
  },
  hourly: {
    type: SignalType.HOLD,
    confidence: 0.6,
    reasoning: ['단기 조정 중'],
    timeframe: '1h',
  },
  minute: {
    type: SignalType.SELL,
    confidence: 0.5,
    reasoning: ['단기 하락'],
    timeframe: '5m',
  },
  consensus: SignalType.BUY,  // 일봉 신호 우선
};
```

## 7. 신호 필터링 규칙

### 7.1 거짓 신호 제거

```typescript
function filterFalseSignals(signal: TradingSignal): boolean {
  // 1. 신뢰도 임계값
  if (signal.confidence < 0.5) {
    return false;  // 약한 신호 제거
  }

  // 2. 거래량 확인
  if (signal.type === SignalType.BUY || signal.type === SignalType.ADD) {
    // 매수 신호는 거래량 증가 필수
    if (!checkVolumeIncrease(signal)) {
      return false;
    }
  }

  // 3. 시장 환경 확인
  const marketCondition = getMarketCondition();
  if (marketCondition === 'BEAR' && signal.type === SignalType.BUY) {
    // 약세장에서 매수 신호는 신중하게
    if (signal.confidence < 0.8) {
      return false;
    }
  }

  return true;
}
```

### 7.2 신호 우선순위

```typescript
const SIGNAL_PRIORITY = {
  [SignalType.SELL]: 10,      // 손절/청산 최우선
  [SignalType.REDUCE]: 9,
  [SignalType.BUY]: 8,
  [SignalType.ADD]: 7,
  [SignalType.HOLD]: 5,
  [SignalType.SKIP]: 1,
};

function prioritizeSignals(signals: TradingSignal[]): TradingSignal[] {
  return signals.sort((a, b) => {
    // 우선순위 > 신뢰도 > 시간
    const priorityDiff = SIGNAL_PRIORITY[b.type] - SIGNAL_PRIORITY[a.type];
    if (priorityDiff !== 0) return priorityDiff;

    return b.confidence - a.confidence;
  });
}
```

## 8. 신호 유효성 검증

### 8.1 백테스트 기반 검증

```typescript
interface SignalPerformance {
  signal_pattern: string;
  win_rate: number;          // 승률
  avg_gain: number;          // 평균 수익률
  avg_loss: number;          // 평균 손실률
  profit_factor: number;     // 수익 팩터
  sample_size: number;       // 샘플 수
}

// 예시: 신호 패턴별 성과
const performanceDB: Record<string, SignalPerformance> = {
  'TREND_FOLLOWING': {
    signal_pattern: 'TREND_FOLLOWING',
    win_rate: 0.65,
    avg_gain: 0.12,
    avg_loss: -0.05,
    profit_factor: 1.8,
    sample_size: 150,
  },
  'BREAKOUT': {
    signal_pattern: 'BREAKOUT',
    win_rate: 0.58,
    avg_gain: 0.18,
    avg_loss: -0.07,
    profit_factor: 1.5,
    sample_size: 80,
  },
};
```

## 9. 실전 예시

### 9.1 비트코인 브레이크아웃 신호

```typescript
const btcSignal: TradingSignal = {
  type: SignalType.BUY,
  urgency: SignalUrgency.IMMEDIATE,
  confidence: 0.84,
  reasoning: [
    '60일 박스권 상단 85,000,000원 돌파',
    '거래량 5.3배 폭증',
    '볼린저 밴드 상단 돌파',
    'MACD 골든크로스',
    'RSI 68 (과매수 아님)',
  ],
  entry_price: 86000000,
  target_price: 94000000,   // +9.3%
  stop_loss: 83000000,      // -3.5%
  position_size: 30,
  timeframe: '1d',
  expires_at: '2026-02-16T09:00:00Z',  // 24시간 유효
};
```

### 9.2 삼성전자 추세 추종 신호

```typescript
const samsungSignal: TradingSignal = {
  type: SignalType.BUY,
  urgency: SignalUrgency.NORMAL,
  confidence: 0.77,
  reasoning: [
    '5/20/60일 이동평균 정배열',
    'MACD 골든크로스 (3일 전)',
    'RSI 56 (중립)',
    '거래량 평균 대비 1.8배',
    '반도체 섹터 강세',
  ],
  entry_price: 72000,
  target_price: 79000,      // +9.7%
  stop_loss: 68500,         // -4.9%
  position_size: 25,
  timeframe: '1d',
};
```

## 10. 참고 문헌

1. **Technical Analysis of the Financial Markets** - John Murphy
   - 추세 추종 및 반전 패턴

2. **Encyclopedia of Chart Patterns** - Thomas Bulkowski
   - 차트 패턴별 성공률 통계

3. **Trading for a Living** - Alexander Elder
   - 다중 시간대 분석 방법

4. **The New Trading for a Living** - Alexander Elder
   - Triple Screen Trading System

5. **Market Wizards** - Jack Schwager
   - 실전 트레이더 신호 해석

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
