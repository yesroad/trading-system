# 슬리피지 모델링 (Slippage Modeling)

## 1. 개요

슬리피지는 **의도한 가격과 실제 체결 가격의 차이**입니다. 백테스트에서 슬리피지를 고려하지 않으면 **실전 성과가 크게 저하**됩니다.

## 2. 거래소별 슬리피지

### 2.1 Upbit (암호화폐)

```typescript
const UPBIT_SLIPPAGE = {
  BASE_FEE: 0.0005,              // 0.05% 기본 수수료
  MARKET_ORDER_SLIPPAGE: 0.001,  // 시장가 추가 슬리피지 0.1%
  LIMIT_ORDER_SLIPPAGE: 0.0,     // 지정가는 슬리피지 없음
  VOLUME_IMPACT: {
    threshold: 1000000,          // 1백만원 이상 주문
    impact_per_million: 0.0002,  // 백만원당 0.02%
  },
};

function calculateUpbitSlippage(
  orderSize: number,
  orderType: 'MARKET' | 'LIMIT',
  avgVolume24h: number
): number {
  let slippage = UPBIT_SLIPPAGE.BASE_FEE;

  if (orderType === 'MARKET') {
    slippage += UPBIT_SLIPPAGE.MARKET_ORDER_SLIPPAGE;

    // 거래량 대비 주문 크기 영향
    const volumeRatio = orderSize / avgVolume24h;
    if (volumeRatio > 0.01) {  // 일일 거래량의 1% 이상
      slippage += volumeRatio * 0.05;  // 추가 슬리피지
    }
  }

  return slippage;
}

// 예시
const slippage = calculateUpbitSlippage(
  5000000,   // 5백만원 주문
  'MARKET',
  500000000  // 일일 거래량 5억원
);
// 0.0005 + 0.001 + (5M/500M * 0.05) = 0.002 (0.2%)
```

### 2.2 Binance (암호화폐)

```typescript
const BINANCE_SLIPPAGE = {
  BASE_FEE: 0.001,               // 0.1% (VIP 0 기준)
  MARKET_ORDER_SLIPPAGE: 0.002,  // 0.2%
  DEPTH_IMPACT: true,            // 호가창 깊이 고려
};

function calculateBinanceSlippage(
  orderSize: number,
  orderBook: OrderBook
): number {
  let slippage = BINANCE_SLIPPAGE.BASE_FEE + BINANCE_SLIPPAGE.MARKET_ORDER_SLIPPAGE;

  // 호가창 시뮬레이션
  let remaining = orderSize;
  let totalCost = 0;

  for (const level of orderBook.asks) {
    const fillAmount = Math.min(remaining, level.quantity);
    totalCost += fillAmount * level.price;
    remaining -= fillAmount;

    if (remaining <= 0) break;
  }

  const avgPrice = totalCost / orderSize;
  const bidPrice = orderBook.bids[0].price;
  const depthSlippage = (avgPrice - bidPrice) / bidPrice;

  return slippage + depthSlippage;
}
```

### 2.3 KIS (한국 주식)

```typescript
const KIS_SLIPPAGE = {
  BASE_FEE: 0.00015,             // 0.015% 위탁 수수료
  TRANSACTION_TAX: 0.0023,       // 0.23% 증권거래세 (매도 시만)
  MARKET_ORDER_SLIPPAGE: 0.0005, // 0.05%
};

function calculateKISSlippage(
  orderSize: number,
  side: 'BUY' | 'SELL',
  avgVolume: number,
  volatility: number             // 변동성 (ATR 등)
): number {
  let slippage = KIS_SLIPPAGE.BASE_FEE + KIS_SLIPPAGE.MARKET_ORDER_SLIPPAGE;

  // 매도 시 거래세
  if (side === 'SELL') {
    slippage += KIS_SLIPPAGE.TRANSACTION_TAX;
  }

  // 거래량 영향
  const volumeRatio = orderSize / avgVolume;
  if (volumeRatio > 0.05) {
    slippage += volumeRatio * 0.01;
  }

  // 변동성 영향
  if (volatility > 2.0) {  // ATR > 2%
    slippage += 0.001;
  }

  return slippage;
}

// 예시: 매도 주문
const kisSlippage = calculateKISSlippage(
  10000000,  // 1천만원 주문
  'SELL',
  100000000, // 일일 평균 거래량 1억원
  1.5        // 변동성 1.5%
);
// 0.00015 + 0.0005 + 0.0023 + (10M/100M * 0.01) = 0.0039 (0.39%)
```

## 3. 백테스트 적용

```typescript
interface Trade {
  symbol: string;
  side: 'BUY' | 'SELL';
  intended_price: number;
  quantity: number;
  broker: 'UPBIT' | 'BINANCE' | 'KIS';
}

function applySlippage(trade: Trade, marketData: any): {
  executed_price: number;
  slippage_pct: number;
  total_cost: number;
} {
  let slippagePct = 0;

  if (trade.broker === 'UPBIT') {
    slippagePct = calculateUpbitSlippage(
      trade.intended_price * trade.quantity,
      'MARKET',
      marketData.volume_24h
    );
  } else if (trade.broker === 'BINANCE') {
    slippagePct = calculateBinanceSlippage(
      trade.intended_price * trade.quantity,
      marketData.order_book
    );
  } else if (trade.broker === 'KIS') {
    slippagePct = calculateKISSlippage(
      trade.intended_price * trade.quantity,
      trade.side,
      marketData.avg_volume,
      marketData.volatility
    );
  }

  // 매수 시: 가격 상승 (불리)
  // 매도 시: 가격 하락 (불리)
  const priceImpact = trade.side === 'BUY' ? 1 + slippagePct : 1 - slippagePct;
  const executedPrice = trade.intended_price * priceImpact;

  const totalCost = executedPrice * trade.quantity;

  return {
    executed_price: executedPrice,
    slippage_pct: slippagePct,
    total_cost: totalCost,
  };
}
```

## 4. 슬리피지 영향 분석

```typescript
function analyzeSlippageImpact(
  backtestResults: Trade[]
): {
  total_slippage_cost: number;
  avg_slippage_pct: number;
  return_reduction: number;  // 수익률 저하
} {
  let totalSlippageCost = 0;
  let totalSlippagePct = 0;

  backtestResults.forEach(trade => {
    const slippage = applySlippage(trade, trade.marketData);
    const cost = Math.abs(slippage.executed_price - trade.intended_price) * trade.quantity;
    totalSlippageCost += cost;
    totalSlippagePct += slippage.slippage_pct;
  });

  const avgSlippagePct = totalSlippagePct / backtestResults.length;

  // 수익률 저하 계산
  const totalCapital = backtestResults[0].intended_price * backtestResults[0].quantity;
  const returnReduction = (totalSlippageCost / totalCapital) * 100;

  return {
    total_slippage_cost: totalSlippageCost,
    avg_slippage_pct: avgSlippagePct,
    return_reduction: returnReduction,
  };
}
```

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
