# 시장 Breadth 지표 (Market Breadth Indicators)

## 1. 개요

Market Breadth는 **전체 시장의 건강도**를 측정하는 지표입니다. 개별 종목이 아닌 **상승/하락 종목 비율, 신고가/신저가 종목 수** 등을 통해 시장 전반의 강도를 파악합니다.

**핵심 철학:**
- 지수만 보면 안 된다 (Narrow Rally vs Broad Rally)
- 다수 종목이 상승해야 건강한 시장
- Divergence 발생 시 반전 신호

## 2. 핵심 Breadth 지표

### 2.1 Advance-Decline Line (AD Line)

**정의:** 상승 종목 수 - 하락 종목 수의 누적 합

```typescript
interface ADLineData {
  date: string;
  advancing: number;        // 상승 종목 수
  declining: number;        // 하락 종목 수
  net_advances: number;     // advancing - declining
  cumulative_ad: number;    // 누적 AD
}

function calculateADLine(data: ADLineData[]): ADLineData[] {
  let cumulative = 0;

  return data.map(day => {
    const netAdvances = day.advancing - day.declining;
    cumulative += netAdvances;

    return {
      ...day,
      net_advances: netAdvances,
      cumulative_ad: cumulative,
    };
  });
}

// 예시
const adLineData = calculateADLine([
  { date: '2026-02-10', advancing: 320, declining: 180 },
  { date: '2026-02-11', advancing: 280, declining: 220 },
  { date: '2026-02-12', advancing: 350, declining: 150 },
  { date: '2026-02-13', advancing: 250, declining: 250 },
  { date: '2026-02-14', advancing: 300, declining: 200 },
]);

// 결과:
// [
//   { date: '2026-02-10', net_advances: 140, cumulative_ad: 140 },
//   { date: '2026-02-11', net_advances: 60, cumulative_ad: 200 },
//   { date: '2026-02-12', net_advances: 200, cumulative_ad: 400 },
//   { date: '2026-02-13', net_advances: 0, cumulative_ad: 400 },
//   { date: '2026-02-14', net_advances: 100, cumulative_ad: 500 },
// ]
```

**해석:**
- **상승 다이버전스:** 지수는 하락하는데 AD Line은 상승 → 바닥 신호
- **하락 다이버전스:** 지수는 상승하는데 AD Line은 하락 → 천정 신호

### 2.2 Advance-Decline Ratio

**정의:** 상승 종목 수 / 하락 종목 수

```typescript
function calculateADRatio(advancing: number, declining: number): number {
  if (declining === 0) return Infinity;
  return advancing / declining;
}

// 예시
const adRatio = calculateADRatio(320, 180);
// 1.78 (상승 종목이 1.78배 많음)

// 해석:
// > 2.0: 강한 상승 모멘텀
// 1.5 ~ 2.0: 상승 추세
// 0.8 ~ 1.5: 중립
// 0.5 ~ 0.8: 하락 추세
// < 0.5: 강한 하락 모멘텀
```

### 2.3 McClellan Oscillator

**정의:** AD Line의 19일 EMA - 39일 EMA

```typescript
function calculateMcClellanOscillator(adData: ADLineData[]): number[] {
  const netAdvances = adData.map(d => d.net_advances);

  const ema19 = calculateEMA(netAdvances, 19);
  const ema39 = calculateEMA(netAdvances, 39);

  return ema19.map((val, i) => val - ema39[i]);
}

// 해석:
// > +100: 과매수 (조정 가능)
// +50 ~ +100: 강한 상승
// 0 ~ +50: 상승
// 0 ~ -50: 하락
// -50 ~ -100: 강한 하락
// < -100: 과매도 (반등 가능)
```

### 2.4 New Highs - New Lows

**정의:** 52주 신고가 종목 수 - 52주 신저가 종목 수

```typescript
interface NewHighLowData {
  date: string;
  new_highs: number;        // 52주 신고가 종목 수
  new_lows: number;         // 52주 신저가 종목 수
  net_new_highs: number;    // new_highs - new_lows
}

function analyzeNewHighLow(data: NewHighLowData): string {
  const netNewHighs = data.new_highs - data.new_lows;

  if (netNewHighs > 50) {
    return 'VERY_BULLISH';  // 강한 상승장
  } else if (netNewHighs > 20) {
    return 'BULLISH';
  } else if (netNewHighs > -20) {
    return 'NEUTRAL';
  } else if (netNewHighs > -50) {
    return 'BEARISH';
  } else {
    return 'VERY_BEARISH';  // 강한 하락장
  }
}

// 예시
const nhNlAnalysis = analyzeNewHighLow({
  date: '2026-02-14',
  new_highs: 120,
  new_lows: 15,
  net_new_highs: 105,
});
// 'VERY_BULLISH'
```

## 3. S&P 500 Breadth 계산

### 3.1 S&P 500 Above MA

**정의:** S&P 500 종목 중 특정 이동평균선 위에 있는 비율

```typescript
interface SP500BreadthData {
  date: string;
  above_50ma: number;       // 50일선 위 종목 수
  above_200ma: number;      // 200일선 위 종목 수
  total_stocks: number;     // 총 종목 수 (500)
}

function calculateSP500Breadth(data: SP500BreadthData): {
  above_50ma_pct: number;
  above_200ma_pct: number;
  strength: string;
} {
  const above50Pct = (data.above_50ma / data.total_stocks) * 100;
  const above200Pct = (data.above_200ma / data.total_stocks) * 100;

  let strength = 'NEUTRAL';

  if (above50Pct > 70 && above200Pct > 60) {
    strength = 'VERY_STRONG';
  } else if (above50Pct > 60 && above200Pct > 50) {
    strength = 'STRONG';
  } else if (above50Pct < 30 && above200Pct < 40) {
    strength = 'WEAK';
  } else if (above50Pct < 20 && above200Pct < 30) {
    strength = 'VERY_WEAK';
  }

  return {
    above_50ma_pct: above50Pct,
    above_200ma_pct: above200Pct,
    strength,
  };
}

// 예시
const sp500Breadth = calculateSP500Breadth({
  date: '2026-02-14',
  above_50ma: 380,
  above_200ma: 340,
  total_stocks: 500,
});
// { above_50ma_pct: 76, above_200ma_pct: 68, strength: 'VERY_STRONG' }
```

### 3.2 S&P 500 Uptrend Ratio

**정의:** 상승 추세 종목 비율 (가격 > 50일선 AND 50일선 > 200일선)

```typescript
interface UptrendData {
  symbol: string;
  price: number;
  ma50: number;
  ma200: number;
}

function calculateUptrendRatio(stocks: UptrendData[]): {
  uptrend_count: number;
  uptrend_ratio: number;
  strength: string;
} {
  const uptrendStocks = stocks.filter(
    stock => stock.price > stock.ma50 && stock.ma50 > stock.ma200
  );

  const ratio = (uptrendStocks.length / stocks.length) * 100;

  let strength = 'NEUTRAL';

  if (ratio > 70) {
    strength = 'VERY_STRONG';
  } else if (ratio > 50) {
    strength = 'STRONG';
  } else if (ratio < 30) {
    strength = 'WEAK';
  } else if (ratio < 20) {
    strength = 'VERY_WEAK';
  }

  return {
    uptrend_count: uptrendStocks.length,
    uptrend_ratio: ratio,
    strength,
  };
}

// 예시
const uptrendRatio = calculateUptrendRatio(sp500Stocks);
// { uptrend_count: 365, uptrend_ratio: 73, strength: 'VERY_STRONG' }
```

## 4. 섹터별 Breadth

### 4.1 섹터별 강도 분석

```typescript
interface SectorBreadth {
  sector: string;
  advancing: number;
  declining: number;
  ad_ratio: number;
  strength: string;
}

function analyzeSectorBreadth(sectors: string[]): SectorBreadth[] {
  return sectors.map(sector => {
    const sectorStocks = getStocksInSector(sector);
    const advancing = sectorStocks.filter(s => s.change > 0).length;
    const declining = sectorStocks.filter(s => s.change < 0).length;
    const adRatio = advancing / declining;

    let strength = 'NEUTRAL';
    if (adRatio > 2.0) {
      strength = 'STRONG';
    } else if (adRatio > 1.5) {
      strength = 'MODERATE';
    } else if (adRatio < 0.5) {
      strength = 'WEAK';
    } else if (adRatio < 0.67) {
      strength = 'MODERATE_WEAK';
    }

    return {
      sector,
      advancing,
      declining,
      ad_ratio: adRatio,
      strength,
    };
  });
}

// 예시
const sectorBreadth = analyzeSectorBreadth([
  'Technology',
  'Financials',
  'Healthcare',
  'Energy',
]);
// [
//   { sector: 'Technology', advancing: 45, declining: 20, ad_ratio: 2.25, strength: 'STRONG' },
//   { sector: 'Financials', advancing: 30, declining: 25, ad_ratio: 1.2, strength: 'NEUTRAL' },
//   { sector: 'Healthcare', advancing: 35, declining: 30, ad_ratio: 1.17, strength: 'NEUTRAL' },
//   { sector: 'Energy', advancing: 10, declining: 25, ad_ratio: 0.4, strength: 'WEAK' },
// ]
```

## 5. Breadth Divergence 감지

### 5.1 상승 다이버전스 (Bullish Divergence)

**조건:**
- 지수 신저가 갱신
- AD Line은 이전 저점보다 높음

```typescript
interface DivergenceAnalysis {
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  strength: number;          // 0 ~ 1
  description: string;
}

function detectBreadthDivergence(
  indexPrices: number[],
  adLineCumulative: number[]
): DivergenceAnalysis {
  const indexLow1 = Math.min(...indexPrices.slice(-20, -10));
  const indexLow2 = Math.min(...indexPrices.slice(-10));

  const adLow1 = Math.min(...adLineCumulative.slice(-20, -10));
  const adLow2 = Math.min(...adLineCumulative.slice(-10));

  // 상승 다이버전스
  if (indexLow2 < indexLow1 && adLow2 > adLow1) {
    const strength = (adLow2 - adLow1) / Math.abs(adLow1);
    return {
      type: 'BULLISH',
      strength: Math.min(1, strength),
      description: '지수는 신저가이나 AD Line은 상승 → 바닥 신호',
    };
  }

  // 하락 다이버전스
  const indexHigh1 = Math.max(...indexPrices.slice(-20, -10));
  const indexHigh2 = Math.max(...indexPrices.slice(-10));

  const adHigh1 = Math.max(...adLineCumulative.slice(-20, -10));
  const adHigh2 = Math.max(...adLineCumulative.slice(-10));

  if (indexHigh2 > indexHigh1 && adHigh2 < adHigh1) {
    const strength = (adHigh1 - adHigh2) / Math.abs(adHigh1);
    return {
      type: 'BEARISH',
      strength: Math.min(1, strength),
      description: '지수는 신고가이나 AD Line은 하락 → 천정 신호',
    };
  }

  return {
    type: 'NONE',
    strength: 0,
    description: '다이버전스 없음',
  };
}
```

## 6. 통합 Breadth 점수

### 6.1 종합 Breadth Score

```typescript
interface BreadthScore {
  ad_ratio_score: number;           // 0 ~ 100
  new_high_low_score: number;       // 0 ~ 100
  sp500_breadth_score: number;      // 0 ~ 100
  uptrend_ratio_score: number;      // 0 ~ 100
  mcclellan_score: number;          // 0 ~ 100
  total_score: number;              // 0 ~ 100 (평균)
  rating: string;                   // 'VERY_STRONG' | 'STRONG' | ...
}

function calculateBreadthScore(data: {
  adRatio: number;
  netNewHighs: number;
  sp500Above50MA: number;
  uptrendRatio: number;
  mcClellanOscillator: number;
}): BreadthScore {
  // 각 지표를 0~100 점수로 정규화
  const adRatioScore = normalizeToScore(data.adRatio, 0.5, 2.0);
  const newHighLowScore = normalizeToScore(data.netNewHighs, -50, 50);
  const sp500BreadthScore = data.sp500Above50MA;  // 이미 퍼센트
  const uptrendRatioScore = data.uptrendRatio;    // 이미 퍼센트
  const mcClellanScore = normalizeToScore(data.mcClellanOscillator, -100, 100);

  const totalScore = (
    adRatioScore +
    newHighLowScore +
    sp500BreadthScore +
    uptrendRatioScore +
    mcClellanScore
  ) / 5;

  let rating = 'NEUTRAL';
  if (totalScore > 80) {
    rating = 'VERY_STRONG';
  } else if (totalScore > 60) {
    rating = 'STRONG';
  } else if (totalScore > 40) {
    rating = 'NEUTRAL';
  } else if (totalScore > 20) {
    rating = 'WEAK';
  } else {
    rating = 'VERY_WEAK';
  }

  return {
    ad_ratio_score: adRatioScore,
    new_high_low_score: newHighLowScore,
    sp500_breadth_score: sp500BreadthScore,
    uptrend_ratio_score: uptrendRatioScore,
    mcclellan_score: mcClellanScore,
    total_score: totalScore,
    rating,
  };
}

// 예시
const breadthScore = calculateBreadthScore({
  adRatio: 1.8,
  netNewHighs: 105,
  sp500Above50MA: 76,
  uptrendRatio: 73,
  mcClellanOscillator: 85,
});
// {
//   ad_ratio_score: 86,
//   new_high_low_score: 100,
//   sp500_breadth_score: 76,
//   uptrend_ratio_score: 73,
//   mcclellan_score: 93,
//   total_score: 85.6,
//   rating: 'VERY_STRONG'
// }
```

## 7. 실전 활용

### 7.1 매수 시점 판단

```typescript
function shouldBuyBasedOnBreadth(breadthScore: BreadthScore): {
  should_buy: boolean;
  confidence: number;
  reasoning: string[];
} {
  const reasoning: string[] = [];

  if (breadthScore.total_score > 70) {
    reasoning.push('전체 시장 강도 매우 높음');
  }

  if (breadthScore.uptrend_ratio_score > 60) {
    reasoning.push('상승 추세 종목 다수 (건강한 시장)');
  }

  if (breadthScore.new_high_low_score > 70) {
    reasoning.push('신고가 종목 우세');
  }

  const shouldBuy = breadthScore.total_score > 60 && reasoning.length >= 2;

  return {
    should_buy: shouldBuy,
    confidence: breadthScore.total_score / 100,
    reasoning,
  };
}
```

### 7.2 매도 시점 판단

```typescript
function shouldSellBasedOnBreadth(breadthScore: BreadthScore): {
  should_sell: boolean;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
  reasoning: string[];
} {
  const reasoning: string[] = [];

  if (breadthScore.total_score < 40) {
    reasoning.push('전체 시장 강도 약화');
  }

  if (breadthScore.ad_ratio_score < 30) {
    reasoning.push('하락 종목 우세');
  }

  if (breadthScore.new_high_low_score < 30) {
    reasoning.push('신저가 종목 급증');
  }

  const shouldSell = breadthScore.total_score < 40 && reasoning.length >= 2;

  let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (breadthScore.total_score < 20) {
    urgency = 'HIGH';
  } else if (breadthScore.total_score < 30) {
    urgency = 'MEDIUM';
  }

  return {
    should_sell: shouldSell,
    urgency,
    reasoning,
  };
}
```

## 8. 데이터 수집 (실전 구현)

### 8.1 Yahoo Finance API 활용

```typescript
import yahooFinance from 'yahoo-finance2';

async function fetchSP500BreadthData(): Promise<SP500BreadthData> {
  // S&P 500 구성 종목 가져오기
  const sp500Symbols = await fetchSP500Constituents();

  const promises = sp500Symbols.map(async (symbol) => {
    const quotes = await yahooFinance.historical(symbol, {
      period1: '2025-08-01',  // 200일 전
      period2: new Date(),
    });

    const currentPrice = quotes[quotes.length - 1].close;
    const ma50 = calculateMA(quotes.slice(-50).map(q => q.close), 50);
    const ma200 = calculateMA(quotes.map(q => q.close), 200);

    return {
      symbol,
      price: currentPrice,
      ma50: ma50[ma50.length - 1],
      ma200: ma200[ma200.length - 1],
    };
  });

  const stocksData = await Promise.all(promises);

  const above50MA = stocksData.filter(s => s.price > s.ma50).length;
  const above200MA = stocksData.filter(s => s.price > s.ma200).length;

  return {
    date: new Date().toISOString().split('T')[0],
    above_50ma: above50MA,
    above_200ma: above200MA,
    total_stocks: sp500Symbols.length,
  };
}
```

## 9. 참고 문헌

1. **Technical Analysis of the Financial Markets** - John Murphy
   - Breadth 지표 기초

2. **Encyclopedia of Chart Patterns** - Thomas Bulkowski
   - Divergence 패턴 분석

3. **The Complete Guide to Market Breadth Indicators** - Gregory L. Morris
   - Breadth 지표 종합 가이드

4. **Martin Zweig's Winning on Wall Street** - Martin Zweig
   - Breadth Thrust 전략

5. **StockCharts.com Market Breadth Articles**
   - 실시간 Breadth 데이터 및 해석

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
