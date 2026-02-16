# Backtest Engine

전문가급 트레이딩 전략 검증 프레임워크

## 기능

### 1. Walk-Forward Analysis
- In-Sample: 60% (전략 최적화)
- Out-of-Sample: 40% (성과 검증)
- Rolling Window: 6개월 단위 이동

### 2. 슬리피지 모델
- **Fixed**: 고정 비율 (Upbit 0.05%, Binance 0.1%)
- **Linear**: 주문 크기 비례 (orderSize / avgVolume × bidAskSpread)
- **Square Root**: 시장 충격 모델 (sqrt(orderSize / avgVolume) × bidAskSpread)

### 3. 성과 지표
- **Total Return**: 총 수익률
- **Sharpe Ratio**: 위험 대비 수익
- **Max Drawdown**: 최대 낙폭
- **Win Rate**: 승률
- **Profit Factor**: 수익 팩터 (총 수익 / 총 손실)
- **Avg Win/Loss**: 평균 승리/손실 금액
- **Avg Trade Duration**: 평균 거래 지속 시간

## 성과 검증 기준

### 필수 통과 (Backtest Framework 스킬 기준)
- Sharpe Ratio > 1.0
- Max Drawdown < 20%
- Win Rate > 45%
- Profit Factor > 1.5

### 우수
- Sharpe Ratio > 2.0
- Max Drawdown < 10%
- Win Rate > 55%

## 사용 방법

### CLI 모드

```bash
# 단순 백테스트
yarn backtest run \
  --symbol KRW-BTC \
  --start 2025-01-01 \
  --end 2025-12-31 \
  --capital 10000000 \
  --strategy simple-ma \
  --short-ma 10 \
  --long-ma 20

# Walk-Forward 분석
yarn backtest walk-forward \
  --symbol KRW-BTC \
  --start 2024-01-01 \
  --end 2025-12-31 \
  --capital 10000000 \
  --strategy simple-ma \
  --in-sample 180 \
  --out-sample 60 \
  --step 30
```

### 라이브러리 모드

```typescript
import { runBacktest, SimpleMAStrategy, SLIPPAGE_PRESETS } from 'backtest-engine';
import Big from 'big.js';

const strategy = new SimpleMAStrategy({
  shortPeriod: 10,
  longPeriod: 20,
});

const config = {
  symbol: 'KRW-BTC',
  startDate: '2025-01-01',
  endDate: '2025-12-31',
  initialCapital: new Big(10000000),
  commission: 0.05, // 0.05%
  slippage: {
    ...SLIPPAGE_PRESETS.upbit,
    orderSize: new Big(0),
    avgVolume: new Big(0),
    bidAskSpread: new Big(0),
  },
};

const result = await runBacktest(strategy, config);

console.log(`총 수익률: ${result.totalReturn.toFixed(2)}%`);
console.log(`Sharpe Ratio: ${result.metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: ${result.metrics.maxDrawdown.toFixed(2)}%`);
```

## 전략 구현

`src/strategies/`에 `Strategy` 인터페이스를 구현:

```typescript
import type { Strategy, StrategySignal, Candle, Position } from '../types.js';

export class MyStrategy implements Strategy {
  name = 'My Strategy';
  params = { /* ... */ };

  generateSignal(candles: Candle[], position: Position | null): StrategySignal {
    // 전략 로직 구현
    return { action: 'BUY' | 'SELL' | 'HOLD' };
  }
}
```

## 주의사항

### 실패 패턴 (반드시 검토)

1. **과최적화**: In-Sample 완벽, Out-of-Sample 참패
2. **Look-Ahead Bias**: 미래 데이터 사용
3. **생존 편향**: 상장폐지 종목 제외

### 권장사항

1. Walk-Forward 분석 필수
2. Out-of-Sample 성과 중점 검토
3. Paper Trading 3개월 후 실전 투입

## 참고

- `.claude/skills/backtest-framework/SKILL.md`: 상세 가이드
- `docs/TRADING_SKILLS_FINAL.md`: 전체 스킬 목록
