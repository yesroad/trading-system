# Leverage Rules (레버리지 규칙)

레버리지 = 빌린 돈으로 거래 → 수익/손실 배수 증폭

## 레버리지란?

**Leverage = 총 포지션 / 자기 자본**

```
예시:
- 자기 자본: $10,000
- 2배 레버리지: $20,000 포지션 가능
- 10배 레버리지: $100,000 포지션 가능

10% 상승 시:
- 1배: +$1,000 (10%)
- 2배: +$2,000 (20%)
- 10배: +$10,000 (100%)

10% 하락 시:
- 1배: -$1,000 (-10%)
- 2배: -$2,000 (-20%)
- 10배: -$10,000 (-100%) ← 강제 청산
```

## 강제 청산 (Liquidation)

**손실이 자기 자본에 도달하면 자동 청산**

```
청산 가격 계산 (Long):
Liquidation Price = Entry × (1 - 1/Leverage)

예시 (10배 레버리지):
- 진입: $100
- 청산: $100 × (1 - 1/10) = $90
- 즉, -10% 하락으로 전액 손실
```

## Trading System 레버리지 규칙

### 암호화폐 (Upbit, Binance)

```typescript
const CRYPTO_LEVERAGE_LIMITS = {
  // Tier 1: 주요 코인
  'BTC': 1.5,
  'ETH': 1.5,

  // Tier 2: 대형 알트
  'SOL': 1.2,
  'XRP': 1.2,
  'ADA': 1.2,

  // Tier 3: 기타 알트
  'default': 1.0,  // 레버리지 없음
};

function getCryptoMaxLeverage(symbol: string): number {
  return CRYPTO_LEVERAGE_LIMITS[symbol] || CRYPTO_LEVERAGE_LIMITS.default;
}
```

**근거:**
- BTC/ETH: 상대적으로 안정적
- 알트코인: 변동성 매우 큼
- 레버리지 낮을수록 안전

### 주식 (KIS, 미국 주식)

```typescript
const STOCK_LEVERAGE_LIMITS = {
  // KRX (한국 주식)
  'KRX': 1.0,  // 신용거래 미사용

  // US (미국 주식)
  'US': 1.0,   // 마진 미사용

  // Pattern Day Trader 계좌
  'US_PDT': 2.0,  // 예외적 허용
};
```

**근거:**
- 주식은 본질적으로 레버리지 없이도 충분
- 신용거래 이자 부담
- 강제 청산 리스크

## 포트폴리오 레벨 레버리지 제한

### 총 레버리지 한도

```typescript
const MAX_PORTFOLIO_LEVERAGE = 1.0;

async function validateTotalLeverage(params: {
  currentPositions: Position[];
  newPosition: { symbol: string; value: Big; leverage: number };
  accountSize: Big;
}): Promise<boolean> {
  // 현재 총 노출 (레버리지 포함)
  const currentExposure = params.currentPositions.reduce((sum, pos) => {
    const posValue = pos.qty.times(pos.current_price).times(pos.leverage || 1);
    return sum.plus(posValue);
  }, new Big(0));

  // 신규 포지션 노출
  const newExposure = params.newPosition.value.times(params.newPosition.leverage);

  // 총 레버리지 계산
  const totalExposure = currentExposure.plus(newExposure);
  const totalLeverage = totalExposure.div(params.accountSize);

  return totalLeverage.lte(MAX_PORTFOLIO_LEVERAGE);
}
```

**예시:**
- 계좌: $100,000
- 포지션 1: BTC $50,000 (1.5배) = $75,000 노출
- 포지션 2: ETH $30,000 (1.5배) = $45,000 노출
- 총 노출: $120,000
- 총 레버리지: 1.2배
- **거부** (1.0배 초과)

## 레버리지 조정 로직

### 변동성 기반 조정

```typescript
function adjustLeverageByVolatility(params: {
  baseL leverage: number;
  atr: Big;
  price: Big;
}): number {
  // ATR % 계산
  const atrPct = params.atr.div(params.price);

  // 변동성이 높으면 레버리지 감소
  if (atrPct.gt(0.05)) {  // 5% 이상
    return params.baseLeverage * 0.5;  // 절반으로
  } else if (atrPct.gt(0.03)) {  // 3-5%
    return params.baseLeverage * 0.75;
  }

  return params.baseLeverage;
}

// 예시
const adjusted = adjustLeverageByVolatility({
  baseLeverage: 1.5,
  atr: new Big(6),
  price: new Big(100),
});
// ATR 6% → adjusted = 1.5 × 0.5 = 0.75배
```

### 계좌 손실률 기반 조정

```typescript
function adjustLeverageByDrawdown(params: {
  baseLeverage: number;
  currentDrawdown: number;  // -0.05 = -5%
}): number {
  const dd = Math.abs(params.currentDrawdown);

  if (dd > 0.10) {  // -10% 이상 손실
    return 0;  // 레버리지 전면 중단
  } else if (dd > 0.05) {  // -5~10%
    return params.baseLeverage * 0.5;
  }

  return params.baseLeverage;
}
```

## 레버리지 vs 포지션 크기

**같은 리스크를 얻는 2가지 방법:**

### 방법 1: 큰 포지션 + 낮은 레버리지
```
- 포지션: $50,000
- 레버리지: 1배
- 리스크 (2% 손절): $1,000
```

### 방법 2: 작은 포지션 + 높은 레버리지
```
- 포지션: $25,000
- 레버리지: 2배
- 실제 노출: $50,000
- 리스크 (2% 손절): $1,000
```

**방법 1 권장 이유:**
- 강제 청산 없음
- 이자 비용 없음
- 심리적 부담 적음

## 실전 검증 로직

```typescript
interface LeverageValidation {
  symbol: string;
  requestedLeverage: number;
  positionValue: Big;
  accountSize: Big;
  currentPositions: Position[];
}

async function validateLeverage(params: LeverageValidation): Promise<{
  approved: boolean;
  maxLeverage: number;
  violations: string[];
}> {
  const violations: string[] = [];

  // 1. 심볼별 한도 체크
  const maxSymbolLeverage = getCryptoMaxLeverage(params.symbol);
  if (params.requestedLeverage > maxSymbolLeverage) {
    violations.push(
      `Symbol leverage limit: ${params.symbol} max ${maxSymbolLeverage}x`
    );
  }

  // 2. 포트폴리오 레버리지 체크
  const totalLeverageOk = await validateTotalLeverage({
    currentPositions: params.currentPositions,
    newPosition: {
      symbol: params.symbol,
      value: params.positionValue,
      leverage: params.requestedLeverage,
    },
    accountSize: params.accountSize,
  });

  if (!totalLeverageOk) {
    violations.push(
      `Portfolio leverage limit: max ${MAX_PORTFOLIO_LEVERAGE}x`
    );
  }

  // 3. 변동성 조정
  const atr = await fetchATR(params.symbol);
  const price = await fetchPrice(params.symbol);
  const adjustedLeverage = adjustLeverageByVolatility({
    baseLeverage: maxSymbolLeverage,
    atr,
    price,
  });

  if (params.requestedLeverage > adjustedLeverage) {
    violations.push(
      `Volatility-adjusted limit: max ${adjustedLeverage}x (high volatility)`
    );
  }

  return {
    approved: violations.length === 0,
    maxLeverage: Math.min(maxSymbolLeverage, adjustedLeverage),
    violations,
  };
}
```

## 레버리지 vs 손절매

**레버리지가 높을수록 손절을 타이트하게**

```typescript
function calculateLeveragedStopLoss(params: {
  entry: Big;
  atr: Big;
  leverage: number;
}): Big {
  // 기본 ATR 배수: 2.0
  // 레버리지 적용: 배수 감소
  const atrMultiplier = 2.0 / params.leverage;

  return params.entry.minus(params.atr.times(atrMultiplier));
}

// 예시
const stop1x = calculateLeveragedStopLoss({
  entry: new Big(100),
  atr: new Big(5),
  leverage: 1.0,
});
// 100 - (5 × 2.0) = $90 (10% 손절)

const stop2x = calculateLeveragedStopLoss({
  entry: new Big(100),
  atr: new Big(5),
  leverage: 2.0,
});
// 100 - (5 × 1.0) = $95 (5% 손절, 2배 레버리지 = 10% 실제 손실)
```

## 레버리지 제한이 엄격한 이유

### 통계적 근거

- **10배 레버리지**
  - -10% 움직임으로 전액 손실
  - 암호화폐는 일일 10% 변동 흔함
  - 생존 불가능

- **5배 레버리지**
  - -20% 움직임으로 전액 손실
  - 여전히 위험

- **2배 레버리지**
  - -50% 움직임 필요
  - 일반적인 변동성에서 생존 가능
  - **하지만 여전히 권장하지 않음**

- **1-1.5배 레버리지** ← 우리 시스템
  - 적당한 레버리지 효과
  - 강제 청산 리스크 낮음
  - 장기적 생존 가능

## 레버리지 모니터링

### 일일 체크

```typescript
async function checkDailyLeverage(): Promise<void> {
  const positions = await loadAllPositions();
  const accountSize = await getAccountSize();

  for (const pos of positions) {
    const leverageRatio = pos.value.div(accountSize);

    if (leverageRatio.gt(getCryptoMaxLeverage(pos.symbol))) {
      // 경고 발송
      await sendAlert({
        type: 'leverage_violation',
        symbol: pos.symbol,
        current: leverageRatio.toNumber(),
        max: getCryptoMaxLeverage(pos.symbol),
      });

      // 강제 감소
      await reducePosition(pos.id, 0.5);  // 절반 청산
    }
  }
}

// 매일 00:00 실행
cron.schedule('0 0 * * *', checkDailyLeverage);
```

## 레버리지 사용 원칙

### DO
✅ 보수적 레버리지 (1-1.5배)
✅ 변동성 낮은 자산에만 적용
✅ 손절매 타이트하게
✅ 포트폴리오 레버리지 모니터링

### DON'T
❌ 3배 이상 레버리지
❌ 변동성 큰 알트코인에 레버리지
❌ 레버리지 + 넓은 손절매
❌ 전 포지션에 레버리지 적용

## 참고 문헌

- Nassim Taleb, "The Black Swan" (극단 리스크)
- Paul Wilmott, "Derivatives" (레버리지 수학)
- CME, "Margin Requirements" (증거금 규칙)
