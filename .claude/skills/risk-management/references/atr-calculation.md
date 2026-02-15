# ATR (Average True Range) 기반 손절매

J. Welles Wilder가 개발한 변동성 지표를 활용한 동적 손절매

## ATR이란?

**Average True Range = 평균 진폭**

시장의 변동성을 측정하는 지표로, 절대값 기반 (백분율 아님)

### True Range (TR) 계산

```typescript
function calculateTrueRange(candle: {
  high: Big;
  low: Big;
  prevClose: Big;
}): Big {
  const { high, low, prevClose } = candle;

  const range1 = high.minus(low);                    // 당일 고가 - 저가
  const range2 = high.minus(prevClose).abs();        // 당일 고가 - 전일 종가
  const range3 = low.minus(prevClose).abs();         // 당일 저가 - 전일 종가

  return Big.max(range1, range2, range3);
}

// 예시
const tr = calculateTrueRange({
  high: new Big(105),
  low: new Big(100),
  prevClose: new Big(103),
});
// max(5, 2, 3) = 5
```

**왜 3가지를 비교?**
- 갭 상승/하락 고려
- 전일 종가 대비 변동성 포함

### ATR 계산

```typescript
function calculateATR(
  candles: Candle[],
  period: number = 14  // 기본 14일
): Big {
  if (candles.length < period + 1) {
    throw new Error('Not enough candles');
  }

  const trValues: Big[] = [];

  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange({
      high: candles[i].high,
      low: candles[i].low,
      prevClose: candles[i - 1].close,
    });
    trValues.push(tr);
  }

  // 첫 ATR은 단순 평균
  const firstATR = trValues
    .slice(0, period)
    .reduce((sum, tr) => sum.plus(tr), new Big(0))
    .div(period);

  // 이후는 Wilder's Smoothing
  let atr = firstATR;
  for (let i = period; i < trValues.length; i++) {
    atr = atr.times(period - 1).plus(trValues[i]).div(period);
  }

  return atr;
}
```

**Wilder's Smoothing:**
```
ATR = ((ATR_prev × 13) + TR_current) / 14
```

지수 이동 평균과 유사하지만 더 부드러움

## ATR 기반 손절매

### 기본 공식

```
손절가 = 진입가 ± (ATR × Multiplier)

매수:
Stop Loss = Entry - (ATR × Multiplier)

매도:
Stop Loss = Entry + (ATR × Multiplier)
```

### 배수 (Multiplier) 선택

| 배수 | 특징 | 용도 |
|------|------|------|
| 1.0x | 매우 타이트 | 스캘핑, 단기 |
| 1.5x | 타이트 | 데이 트레이딩 |
| 2.0x | 표준 | 스윙 트레이딩 (권장) |
| 2.5x | 느슨함 | 중기 투자 |
| 3.0x | 매우 느슨함 | 장기 투자 |

**2.0x 권장 이유:**
- 정상 변동성 흡수
- 조기 청산 방지
- 백테스팅 검증 (가장 좋은 성과)

### TypeScript 구현

```typescript
interface ATRStopLossParams {
  entry: Big;
  atr: Big;
  multiplier: number;
  side: 'long' | 'short';
  minStopPct?: number;  // 최소 손절 %
  maxStopPct?: number;  // 최대 손절 %
}

function calculateATRStopLoss(params: ATRStopLossParams): Big {
  const { entry, atr, multiplier, side, minStopPct = 0.005, maxStopPct = 0.05 } = params;

  // ATR 기반 손절 거리
  const stopDistance = atr.times(multiplier);

  // 손절가 계산
  let stopLoss: Big;
  if (side === 'long') {
    stopLoss = entry.minus(stopDistance);
  } else {
    stopLoss = entry.plus(stopDistance);
  }

  // 퍼센트 변환
  const stopPct = stopDistance.div(entry);

  // 최소/최대 범위 제한
  if (stopPct.lt(minStopPct)) {
    // 너무 타이트하면 최소값 사용
    stopLoss = side === 'long'
      ? entry.times(1 - minStopPct)
      : entry.times(1 + minStopPct);
  } else if (stopPct.gt(maxStopPct)) {
    // 너무 느슨하면 최대값 사용
    stopLoss = side === 'long'
      ? entry.times(1 - maxStopPct)
      : entry.times(1 + maxStopPct);
  }

  return stopLoss;
}

// 예시
const stopLoss = calculateATRStopLoss({
  entry: new Big(100),
  atr: new Big(3),
  multiplier: 2.0,
  side: 'long',
});
// 결과: 100 - (3 × 2.0) = $94
// 손절: 6% (허용 범위 내)
```

## 동적 손절 (Trailing Stop)

### 가격 상승 시 손절가도 상승

```typescript
function updateTrailingStop(params: {
  currentPrice: Big;
  currentStop: Big;
  atr: Big;
  multiplier: number;
  side: 'long';
}): Big {
  const newStop = params.currentPrice.minus(
    params.atr.times(params.multiplier)
  );

  // Long 포지션: 손절가는 올라가기만 함 (내려가지 않음)
  return Big.max(params.currentStop, newStop);
}

// 예시
// 초기: Entry $100, ATR $3, Stop $94
// 가격 $110으로 상승
const newStop = updateTrailingStop({
  currentPrice: new Big(110),
  currentStop: new Big(94),
  atr: new Big(3),
  multiplier: 2.0,
  side: 'long',
});
// 결과: max(94, 110 - 6) = $104 (손절가 상승)
```

## ATR vs 고정 퍼센트 비교

### 고정 퍼센트 (예: -5%)

```
장점:
- 단순
- 리스크 금액 명확

단점:
- 변동성 무시
- 조용한 종목에는 너무 넓음
- 변동성 큰 종목에는 너무 타이트
```

### ATR 기반

```
장점:
- 변동성 적응
- 시장 상황 반영
- 조기 청산 감소

단점:
- 계산 복잡
- 리스크 금액 가변적
- ATR 급변 시 문제
```

## 실전 활용

### 1. 진입 전 ATR 확인

```typescript
async function validateEntryWithATR(params: {
  symbol: string;
  entry: Big;
  accountSize: Big;
  maxRiskPct: number;
}): Promise<{ approved: boolean; stopLoss: Big; positionSize: Big }> {
  // ATR 조회 (최근 14일)
  const atr = await fetchATR(params.symbol, 14);

  // 손절가 계산
  const stopLoss = calculateATRStopLoss({
    entry: params.entry,
    atr,
    multiplier: 2.0,
    side: 'long',
  });

  // 주당 리스크
  const riskPerShare = params.entry.minus(stopLoss);

  // 포지션 크기 계산
  const riskAmount = params.accountSize.times(params.maxRiskPct);
  const positionSize = riskAmount.div(riskPerShare);

  // 리스크 % 확인
  const stopPct = riskPerShare.div(params.entry);
  const approved = stopPct.gte(0.005) && stopPct.lte(0.05);  // 0.5-5%

  return { approved, stopLoss, positionSize };
}
```

### 2. 실시간 손절가 업데이트

```typescript
// 매 봉 업데이트 (1시간봉, 일봉 등)
setInterval(async () => {
  for (const position of openPositions) {
    const currentPrice = await fetchPrice(position.symbol);
    const atr = await fetchATR(position.symbol, 14);

    const newStop = updateTrailingStop({
      currentPrice,
      currentStop: position.stopLoss,
      atr,
      multiplier: 2.0,
      side: position.side,
    });

    if (newStop.gt(position.stopLoss)) {
      await updatePosition(position.id, { stopLoss: newStop });
      logger.info('Trailing stop updated', { symbol: position.symbol, newStop });
    }
  }
}, 3600000);  // 1시간마다
```

### 3. ATR Multiplier 최적화

```typescript
// 백테스팅으로 최적 배수 찾기
const multipliers = [1.0, 1.5, 2.0, 2.5, 3.0];
const results = [];

for (const mult of multipliers) {
  const result = await backtest({
    strategy: 'trend-following',
    stopLossMethod: 'atr',
    atrMultiplier: mult,
  });

  results.push({
    multiplier: mult,
    sharpe: result.sharpeRatio,
    maxDrawdown: result.maxDrawdown,
    winRate: result.winRate,
  });
}

// 최고 Sharpe Ratio 선택
const best = results.sort((a, b) => b.sharpe - a.sharpe)[0];
console.log('Best multiplier:', best.multiplier);
```

## 시장별 권장 설정

| 시장 | 기간 | 배수 |
|------|------|------|
| 암호화폐 | 14 | 2.0-2.5 (변동성 큼) |
| 주식 (스윙) | 14 | 2.0 |
| 주식 (장기) | 20 | 2.5-3.0 |
| 외환 | 14 | 1.5-2.0 |
| 선물 | 10 | 1.5 (빠른 반응) |

## 주의사항

1. **ATR은 방향성 없음** (추세 판단 안 함)
2. **급격한 변동성 변화 시 재계산 필요**
3. **백테스팅으로 배수 최적화 필수**
4. **최소/최대 % 범위 설정 권장** (0.5-5%)
5. **레버리지 사용 시 배수 낮춤** (예: 2.0 → 1.5)

## 참고 문헌

- J. Welles Wilder, "New Concepts in Technical Trading Systems" (1978)
- Perry Kaufman, "Trading Systems and Methods"
