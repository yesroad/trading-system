# Position Sizing (포지션 사이징)

리스크 관리의 핵심: 얼마나 매수/매도할 것인가?

## 기본 원칙

### 1% 룰 (1% Rule)

**거래당 최대 리스크 = 계좌의 1%**

```
리스크 금액 = 계좌 자산 × 1%
포지션 크기 = 리스크 금액 / 주당 리스크

예시:
- 계좌: $100,000
- 1% 리스크: $1,000
- 진입: $50
- 손절: $48
- 주당 리스크: $2
- 포지션 크기: $1,000 / $2 = 500주
- 총 금액: 500 × $50 = $25,000 (계좌의 25%)
```

**장점:**
- 연속 손실 시 생존 가능
- 10번 연속 손실 = -9.6% (복리 효과)
- 감정적 부담 감소

### 2% 룰 (공격적)

- 더 큰 수익 가능
- 하지만 더 큰 리스크
- 10번 연속 손실 = -18.3%

## 포지션 크기 계산 방법

### 방법 1: 고정 리스크 퍼센트

```typescript
function calculatePositionSize(params: {
  accountSize: Big;
  riskPercentage: number;  // 0.01 = 1%
  entry: Big;
  stopLoss: Big;
}): Big {
  const riskAmount = params.accountSize.times(params.riskPercentage);
  const riskPerShare = params.entry.minus(params.stopLoss).abs();

  if (riskPerShare.eq(0)) {
    throw new Error('Stop loss cannot equal entry price');
  }

  return riskAmount.div(riskPerShare);
}

// 예시
const size = calculatePositionSize({
  accountSize: new Big(100000),
  riskPercentage: 0.01,
  entry: new Big(50),
  stopLoss: new Big(48),
});
// 결과: 500주
```

### 방법 2: 고정 금액

```typescript
// 거래당 $1,000 고정 리스크
const fixedRisk = new Big(1000);
const positionSize = fixedRisk.div(riskPerShare);
```

**장점:** 단순
**단점:** 계좌 크기 변화 무시

### 방법 3: 변동성 기반 (ATR)

```typescript
function calculatePositionSizeATR(params: {
  accountSize: Big;
  riskPercentage: number;
  entry: Big;
  atr: Big;
  atrMultiplier: number;  // 보통 2.0
}): Big {
  const riskAmount = params.accountSize.times(params.riskPercentage);
  const stopDistance = params.atr.times(params.atrMultiplier);

  return riskAmount.div(stopDistance);
}

// 예시: ATR = $5, 2배 = $10 손절
const sizeATR = calculatePositionSizeATR({
  accountSize: new Big(100000),
  riskPercentage: 0.01,
  entry: new Big(50),
  atr: new Big(5),
  atrMultiplier: 2.0,
});
// 결과: 100주 (리스크 $1,000 / 손절 $10)
```

## Kelly Criterion (켈리 기준)

**최적 포지션 크기 = (승률 × 평균수익) - ((1-승률) × 평균손실) / 평균손실**

```typescript
function kellyPercentage(params: {
  winRate: number;      // 0.6 = 60%
  avgWin: number;       // 평균 승리 $1,500
  avgLoss: number;      // 평균 손실 $1,000
}): number {
  const { winRate, avgWin, avgLoss } = params;
  const lossRate = 1 - winRate;

  const kelly = (winRate * avgWin - lossRate * avgLoss) / avgLoss;

  // 보수적: Kelly의 1/2 또는 1/4 사용
  return kelly * 0.5;
}

// 예시
const kelly = kellyPercentage({
  winRate: 0.6,
  avgWin: 1500,
  avgLoss: 1000,
});
// 결과: ~0.15 (15%)
// Half Kelly: 7.5%
```

**주의:**
- 매우 공격적 (Full Kelly)
- Half Kelly 또는 Quarter Kelly 권장
- 과거 데이터 기반 (미래 보장 안 됨)

## 포트폴리오 레벨 제한

### 심볼당 최대 비중

```typescript
const MAX_POSITION_PCT = 0.25;  // 25%

function limitPositionSize(
  calculatedSize: Big,
  entry: Big,
  accountSize: Big
): Big {
  const maxDollarAmount = accountSize.times(MAX_POSITION_PCT);
  const maxShares = maxDollarAmount.div(entry);

  return Big.min(calculatedSize, maxShares);
}
```

**권장:**
- 보수적: 10-15% per symbol
- 중간: 20-25% per symbol
- 공격적: 30-33% per symbol (최대 3종목)

### 총 포지션 한도

```typescript
const MAX_TOTAL_EXPOSURE = 1.0;  // 100%

function checkTotalExposure(
  positions: Position[],
  newPosition: { symbol: string; value: Big },
  accountSize: Big
): boolean {
  const currentExposure = positions.reduce(
    (sum, pos) => sum.plus(pos.value),
    new Big(0)
  );

  const totalExposure = currentExposure.plus(newPosition.value);
  const exposureRatio = totalExposure.div(accountSize);

  return exposureRatio.lte(MAX_TOTAL_EXPOSURE);
}
```

## 레버리지 고려

### 암호화폐 레버리지

```typescript
const LEVERAGE_LIMITS = {
  'BTC': 1.5,
  'ETH': 1.5,
  'default': 1.2,  // 알트코인
};

function calculateLeveragedPosition(params: {
  baseSize: Big;
  symbol: string;
}): Big {
  const maxLeverage = LEVERAGE_LIMITS[params.symbol]
    || LEVERAGE_LIMITS.default;

  return params.baseSize.times(maxLeverage);
}
```

**주의:**
- 레버리지 = 수익 × N, 손실 × N
- 강제 청산 리스크
- 보수적 사용 권장

## 피라미딩 (Pyramiding)

**수익 나는 포지션에 추가 매수**

```typescript
// 초기 포지션: 1%
// 1차 추가: 0.5% (가격 +5%)
// 2차 추가: 0.25% (가격 +10%)

function calculatePyramidSize(
  initialSize: Big,
  level: number  // 1, 2, 3...
): Big {
  return initialSize.div(Math.pow(2, level));
}
```

**규칙:**
- 수익 나는 경우만
- 점점 작은 크기로
- 총 리스크 관리 (예: 최대 2%)

## 실전 체크리스트

```
포지션 크기 결정 전:
1. ✓ 리스크 퍼센트 확인 (1-2%)
2. ✓ 진입가와 손절가 명확
3. ✓ 심볼당 최대 비중 체크 (25%)
4. ✓ 총 포지션 비중 체크 (100%)
5. ✓ 레버리지 한도 확인
6. ✓ 계좌 잔고 충분한지 확인
```

## 실수 사례

### ❌ 안 좋은 예

```typescript
// 1. 고정 주식 수 (계좌 크기 무시)
const shares = 100;  // 항상 100주

// 2. 백분율로만 계산 (손절 무시)
const dollarAmount = accountSize.times(0.2);  // 20%
const shares = dollarAmount.div(entry);

// 3. 오버레버리지
const position = accountSize.times(10);  // 10배 레버리지
```

### ✅ 좋은 예

```typescript
const params = {
  accountSize: new Big(100000),
  riskPercentage: 0.01,
  entry: new Big(50),
  stopLoss: new Big(48),
  symbol: 'BTC',
};

// 1. 리스크 기반 계산
let size = calculatePositionSize(params);

// 2. 심볼 한도 적용
size = limitPositionSize(size, params.entry, params.accountSize);

// 3. 레버리지 적용
size = calculateLeveragedPosition({ baseSize: size, symbol: params.symbol });

// 4. 총 노출 확인
if (!checkTotalExposure(positions, { symbol: params.symbol, value: size.times(params.entry) }, params.accountSize)) {
  throw new Error('Total exposure limit exceeded');
}
```

## 참고 문헌

- Van K. Tharp, "Trade Your Way to Financial Freedom"
- Ralph Vince, "The Mathematics of Money Management"
- Ryan Jones, "The Trading Game"
