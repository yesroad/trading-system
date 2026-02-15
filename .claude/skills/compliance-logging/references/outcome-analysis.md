# 사후 분석 방법론 (Outcome Analysis)

## 1. 개요

사후 분석은 과거 거래를 체계적으로 검토하여 **승률, 손익 분포, 실패 패턴**을 식별하고 전략을 개선하는 프로세스입니다.

**핵심 목표:**
- 승률 및 손익 통계 정량화
- 반복되는 실패 패턴 식별
- 성공 거래 공통 요소 추출
- 전략 조정 근거 마련

## 2. 기본 성과 지표

### 2.1 승률 (Win Rate)

```typescript
interface WinRateAnalysis {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  breakeven_trades: number;
  win_rate: number;              // winning / total
  loss_rate: number;             // losing / total
}

function calculateWinRate(trades: Outcome[]): WinRateAnalysis {
  const total = trades.length;
  const winning = trades.filter(t => t.realized_pnl_pct > 0).length;
  const losing = trades.filter(t => t.realized_pnl_pct < 0).length;
  const breakeven = trades.filter(t => t.realized_pnl_pct === 0).length;

  return {
    total_trades: total,
    winning_trades: winning,
    losing_trades: losing,
    breakeven_trades: breakeven,
    win_rate: winning / total,
    loss_rate: losing / total,
  };
}

// 예시
const winRate = calculateWinRate(last30DaysTrades);
// { total: 50, winning: 32, losing: 16, breakeven: 2, win_rate: 0.64, loss_rate: 0.32 }
```

### 2.2 평균 손익

```typescript
interface AveragePnL {
  avg_win: number;               // 평균 수익 (승리 거래만)
  avg_loss: number;              // 평균 손실 (손실 거래만)
  avg_win_loss_ratio: number;    // 평균 수익 / 평균 손실
  largest_win: number;
  largest_loss: number;
}

function calculateAveragePnL(trades: Outcome[]): AveragePnL {
  const wins = trades.filter(t => t.realized_pnl_pct > 0);
  const losses = trades.filter(t => t.realized_pnl_pct < 0);

  const avg_win = wins.reduce((sum, t) => sum + t.realized_pnl_pct, 0) / wins.length;
  const avg_loss = losses.reduce((sum, t) => sum + t.realized_pnl_pct, 0) / losses.length;

  return {
    avg_win,
    avg_loss: Math.abs(avg_loss),
    avg_win_loss_ratio: avg_win / Math.abs(avg_loss),
    largest_win: Math.max(...wins.map(t => t.realized_pnl_pct)),
    largest_loss: Math.min(...losses.map(t => t.realized_pnl_pct)),
  };
}

// 예시
const avgPnL = calculateAveragePnL(last30DaysTrades);
// { avg_win: 5.2, avg_loss: 2.8, avg_win_loss_ratio: 1.86, largest_win: 12.5, largest_loss: -5.0 }
```

### 2.3 수익 팩터 (Profit Factor)

```typescript
function calculateProfitFactor(trades: Outcome[]): number {
  const totalWin = trades
    .filter(t => t.realized_pnl > 0)
    .reduce((sum, t) => sum + t.realized_pnl, 0);

  const totalLoss = Math.abs(
    trades
      .filter(t => t.realized_pnl < 0)
      .reduce((sum, t) => sum + t.realized_pnl, 0)
  );

  return totalWin / totalLoss;
}

// 예시
const profitFactor = calculateProfitFactor(last30DaysTrades);
// 1.85 (총 수익 / 총 손실)

// 해석:
// > 2.0: 매우 우수
// 1.5 ~ 2.0: 우수
// 1.0 ~ 1.5: 양호 (수익 > 손실)
// < 1.0: 불량 (손실 > 수익)
```

### 2.4 기대값 (Expectancy)

```typescript
function calculateExpectancy(trades: Outcome[]): number {
  const winRate = calculateWinRate(trades).win_rate;
  const avgPnL = calculateAveragePnL(trades);

  // Expectancy = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)
  const expectancy = (winRate * avgPnL.avg_win) - ((1 - winRate) * avgPnL.avg_loss);

  return expectancy;
}

// 예시
const expectancy = calculateExpectancy(last30DaysTrades);
// 2.32% (거래당 기대 수익률)

// 해석:
// > 0: 장기적으로 수익 예상
// < 0: 장기적으로 손실 예상
```

## 3. 시간대별 분석

### 3.1 보유 기간별 성과

```typescript
interface HoldingPeriodAnalysis {
  period_range: string;          // '< 1일', '1~3일', ...
  trade_count: number;
  avg_pnl: number;
  win_rate: number;
}

function analyzeByHoldingPeriod(trades: ACETradeLog[]): HoldingPeriodAnalysis[] {
  const periods = [
    { range: '< 1일', minHours: 0, maxHours: 24 },
    { range: '1~3일', minHours: 24, maxHours: 72 },
    { range: '3~7일', minHours: 72, maxHours: 168 },
    { range: '> 7일', minHours: 168, maxHours: Infinity },
  ];

  return periods.map(period => {
    const periodTrades = trades.filter(t => {
      const hours = parseHoldingPeriodToHours(t.outcome!.holding_period);
      return hours >= period.minHours && hours < period.maxHours;
    });

    return {
      period_range: period.range,
      trade_count: periodTrades.length,
      avg_pnl: avgPnL(periodTrades),
      win_rate: calculateWinRate(periodTrades.map(t => t.outcome!)).win_rate,
    };
  });
}

// 예시 결과
// [
//   { period_range: '< 1일', trade_count: 8, avg_pnl: 1.2, win_rate: 0.50 },
//   { period_range: '1~3일', trade_count: 22, avg_pnl: 3.8, win_rate: 0.68 },
//   { period_range: '3~7일', trade_count: 15, avg_pnl: 5.2, win_rate: 0.73 },
//   { period_range: '> 7일', trade_count: 5, avg_pnl: 2.5, win_rate: 0.60 },
// ]
// → 3~7일 보유가 가장 효과적
```

### 3.2 시간대별 성과 (Intraday)

```typescript
interface TimeOfDayAnalysis {
  hour_range: string;            // '09:00~12:00'
  trade_count: number;
  avg_pnl: number;
  win_rate: number;
}

function analyzeByTimeOfDay(trades: ACETradeLog[]): TimeOfDayAnalysis[] {
  const timeRanges = [
    { range: '09:00~12:00', startHour: 9, endHour: 12 },
    { range: '12:00~15:00', startHour: 12, endHour: 15 },
    { range: '15:00~18:00', startHour: 15, endHour: 18 },
    { range: '18:00~21:00', startHour: 18, endHour: 21 },
  ];

  return timeRanges.map(range => {
    const rangeTrades = trades.filter(t => {
      const hour = new Date(t.execution.timestamp).getHours();
      return hour >= range.startHour && hour < range.endHour;
    });

    return {
      hour_range: range.range,
      trade_count: rangeTrades.length,
      avg_pnl: avgPnL(rangeTrades),
      win_rate: calculateWinRate(rangeTrades.map(t => t.outcome!)).win_rate,
    };
  });
}
```

## 4. 전략별 분석

### 4.1 신호 패턴별 성과

```typescript
interface StrategyPerformance {
  strategy_name: string;
  trade_count: number;
  win_rate: number;
  avg_pnl: number;
  profit_factor: number;
  expectancy: number;
}

function analyzeByStrategy(trades: ACETradeLog[]): StrategyPerformance[] {
  // 거래에 태그된 전략별로 그룹화
  const strategies = ['BREAKOUT', 'TREND_FOLLOWING', 'REVERSAL', 'MEAN_REVERSION'];

  return strategies.map(strategy => {
    const strategyTrades = trades.filter(t => t.tags.includes(strategy));
    const outcomes = strategyTrades.map(t => t.outcome!);

    return {
      strategy_name: strategy,
      trade_count: strategyTrades.length,
      win_rate: calculateWinRate(outcomes).win_rate,
      avg_pnl: avgPnL(strategyTrades),
      profit_factor: calculateProfitFactor(outcomes),
      expectancy: calculateExpectancy(outcomes),
    };
  });
}

// 예시 결과
// [
//   { strategy: 'BREAKOUT', count: 18, win_rate: 0.61, avg_pnl: 4.2, profit_factor: 1.9, expectancy: 2.1 },
//   { strategy: 'TREND_FOLLOWING', count: 25, win_rate: 0.68, avg_pnl: 5.1, profit_factor: 2.2, expectancy: 3.0 },
//   { strategy: 'REVERSAL', count: 12, win_rate: 0.50, avg_pnl: 2.5, profit_factor: 1.3, expectancy: 0.8 },
//   { strategy: 'MEAN_REVERSION', count: 8, win_rate: 0.38, avg_pnl: -0.5, profit_factor: 0.8, expectancy: -1.2 },
// ]
// → TREND_FOLLOWING이 가장 우수, MEAN_REVERSION은 손실
```

### 4.2 신뢰도별 성과

```typescript
interface ConfidencePerformance {
  confidence_range: string;      // '0.7~0.8'
  trade_count: number;
  win_rate: number;
  avg_pnl: number;
}

function analyzeByConfidence(trades: ACETradeLog[]): ConfidencePerformance[] {
  const ranges = [
    { range: '0.5~0.6', min: 0.5, max: 0.6 },
    { range: '0.6~0.7', min: 0.6, max: 0.7 },
    { range: '0.7~0.8', min: 0.7, max: 0.8 },
    { range: '0.8~0.9', min: 0.8, max: 0.9 },
    { range: '0.9~1.0', min: 0.9, max: 1.0 },
  ];

  return ranges.map(range => {
    const rangeTrades = trades.filter(t => {
      const conf = t.capability.analysis.confidence;
      return conf >= range.min && conf < range.max;
    });

    return {
      confidence_range: range.range,
      trade_count: rangeTrades.length,
      win_rate: calculateWinRate(rangeTrades.map(t => t.outcome!)).win_rate,
      avg_pnl: avgPnL(rangeTrades),
    };
  });
}

// 예시 결과
// [
//   { range: '0.5~0.6', count: 5, win_rate: 0.40, avg_pnl: -0.5 },
//   { range: '0.6~0.7', count: 12, win_rate: 0.58, avg_pnl: 2.1 },
//   { range: '0.7~0.8', count: 20, win_rate: 0.65, avg_pnl: 3.8 },
//   { range: '0.8~0.9', count: 10, win_rate: 0.80, avg_pnl: 6.2 },
//   { range: '0.9~1.0', count: 3, win_rate: 1.00, avg_pnl: 8.5 },
// ]
// → 신뢰도 0.7 이상에서 양호한 성과
```

## 5. 실패 패턴 식별

### 5.1 반복 손실 원인 분석

```typescript
interface FailurePattern {
  pattern_name: string;
  occurrences: number;
  avg_loss: number;
  examples: string[];            // 거래 ID 또는 설명
}

function identifyFailurePatterns(trades: ACETradeLog[]): FailurePattern[] {
  const failures = trades.filter(t => t.outcome?.performance.goal_achieved === false);

  // 손실 이유별로 그룹화
  const patterns: Record<string, ACETradeLog[]> = {};

  failures.forEach(trade => {
    const exitReason = trade.outcome!.exit_reason;
    if (!patterns[exitReason]) {
      patterns[exitReason] = [];
    }
    patterns[exitReason].push(trade);
  });

  return Object.entries(patterns).map(([reason, trades]) => ({
    pattern_name: reason,
    occurrences: trades.length,
    avg_loss: avgPnL(trades),
    examples: trades.slice(0, 3).map(t => t.id),
  })).sort((a, b) => b.occurrences - a.occurrences);
}

// 예시 결과
// [
//   {
//     pattern: '거짓 브레이크아웃 (False Breakout)',
//     occurrences: 8,
//     avg_loss: -3.2,
//     examples: ['log-123', 'log-456', 'log-789'],
//   },
//   {
//     pattern: '추세 반전 미감지',
//     occurrences: 5,
//     avg_loss: -4.1,
//     examples: ['log-234', 'log-567'],
//   },
//   {
//     pattern: '과매수 구간 진입',
//     occurrences: 3,
//     avg_loss: -2.5,
//     examples: ['log-345'],
//   },
// ]
```

### 5.2 손실 거래 공통 요소

```typescript
interface CommonFailureFactors {
  factor: string;
  frequency: number;             // 손실 거래에서 나타난 빈도
  correlation: number;           // 손실과의 상관관계 (-1 ~ 1)
}

function analyzeCommonFailureFactors(trades: ACETradeLog[]): CommonFailureFactors[] {
  const losses = trades.filter(t => t.outcome!.realized_pnl_pct < 0);

  const factors = [
    {
      factor: '거래량 부족 (< 1.5배)',
      frequency: countIf(losses, t => {
        const volumeRatio = extractVolumeRatio(t.capability);
        return volumeRatio < 1.5;
      }),
      correlation: calculateCorrelation(losses, 'volume_ratio', 'pnl'),
    },
    {
      factor: '다중 시간대 불일치',
      frequency: countIf(losses, t => !t.capability.analysis.consensus),
      correlation: calculateCorrelation(losses, 'consensus', 'pnl'),
    },
    {
      factor: '신뢰도 < 0.7',
      frequency: countIf(losses, t => t.capability.analysis.confidence < 0.7),
      correlation: calculateCorrelation(losses, 'confidence', 'pnl'),
    },
    {
      factor: 'RSI 과매수/과매도',
      frequency: countIf(losses, t => isRsiExtreme(t)),
      correlation: calculateCorrelation(losses, 'rsi_extreme', 'pnl'),
    },
  ];

  return factors.sort((a, b) => b.frequency - a.frequency);
}

// 예시 결과
// [
//   { factor: '거래량 부족', frequency: 12, correlation: -0.65 },
//   { factor: '다중 시간대 불일치', frequency: 10, correlation: -0.58 },
//   { factor: '신뢰도 < 0.7', frequency: 8, correlation: -0.72 },
//   { factor: 'RSI 과매수/과매도', frequency: 5, correlation: -0.45 },
// ]
// → 신뢰도 부족이 손실과 가장 강한 상관관계
```

## 6. 성공 거래 분석

### 6.1 승리 거래 공통 요소

```typescript
interface CommonSuccessFactors {
  factor: string;
  frequency: number;             // 승리 거래에서 나타난 빈도
  avg_win: number;               // 이 요소가 있을 때 평균 수익률
}

function analyzeCommonSuccessFactors(trades: ACETradeLog[]): CommonSuccessFactors[] {
  const wins = trades.filter(t => t.outcome!.realized_pnl_pct > 0);

  const factors = [
    {
      factor: '거래량 3배 이상',
      frequency: countIf(wins, t => extractVolumeRatio(t.capability) > 3.0),
      avg_win: avgPnLIf(wins, t => extractVolumeRatio(t.capability) > 3.0),
    },
    {
      factor: '다중 시간대 일치',
      frequency: countIf(wins, t => t.capability.analysis.consensus),
      avg_win: avgPnLIf(wins, t => t.capability.analysis.consensus),
    },
    {
      factor: '신뢰도 > 0.8',
      frequency: countIf(wins, t => t.capability.analysis.confidence > 0.8),
      avg_win: avgPnLIf(wins, t => t.capability.analysis.confidence > 0.8),
    },
    {
      factor: '리스크/보상 > 2.5',
      frequency: countIf(wins, t => t.capability.risk_management.risk_reward_ratio > 2.5),
      avg_win: avgPnLIf(wins, t => t.capability.risk_management.risk_reward_ratio > 2.5),
    },
  ];

  return factors.sort((a, b) => b.avg_win - a.avg_win);
}

// 예시 결과
// [
//   { factor: '신뢰도 > 0.8', frequency: 15, avg_win: 7.2 },
//   { factor: '리스크/보상 > 2.5', frequency: 12, avg_win: 6.8 },
//   { factor: '거래량 3배 이상', frequency: 18, avg_win: 6.5 },
//   { factor: '다중 시간대 일치', frequency: 20, avg_win: 5.9 },
// ]
// → 신뢰도 높은 거래가 평균 수익률 가장 높음
```

## 7. 드로다운 분석

### 7.1 최대 드로다운 (MDD)

```typescript
interface DrawdownAnalysis {
  max_drawdown: number;          // 최대 낙폭 (%)
  max_drawdown_duration: string; // 최대 낙폭 지속 기간
  current_drawdown: number;      // 현재 드로다운
  recovery_trades: number;       // 회복에 필요한 거래 수 (추정)
}

function analyzeDrawdown(trades: ACETradeLog[]): DrawdownAnalysis {
  let peak = 0;
  let maxDrawdown = 0;
  let maxDrawdownStart = 0;
  let maxDrawdownEnd = 0;
  let currentEquity = 0;

  trades.forEach((trade, index) => {
    currentEquity += trade.outcome!.realized_pnl_pct;

    if (currentEquity > peak) {
      peak = currentEquity;
    }

    const drawdown = ((peak - currentEquity) / peak) * 100;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownStart = trades.findIndex(t => t.outcome!.realized_pnl_pct === peak);
      maxDrawdownEnd = index;
    }
  });

  const currentDrawdown = ((peak - currentEquity) / peak) * 100;

  return {
    max_drawdown: maxDrawdown,
    max_drawdown_duration: `${maxDrawdownEnd - maxDrawdownStart} trades`,
    current_drawdown: currentDrawdown,
    recovery_trades: estimateRecoveryTrades(currentDrawdown, trades),
  };
}
```

### 7.2 연속 손실 분석

```typescript
interface ConsecutiveLossAnalysis {
  max_consecutive_losses: number;
  current_consecutive_losses: number;
  avg_consecutive_losses: number;
  recovery_pattern: string;      // 회복 패턴 설명
}

function analyzeConsecutiveLosses(trades: ACETradeLog[]): ConsecutiveLossAnalysis {
  let maxStreak = 0;
  let currentStreak = 0;
  let streaks: number[] = [];

  trades.forEach(trade => {
    if (trade.outcome!.realized_pnl_pct < 0) {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      if (currentStreak > 0) {
        streaks.push(currentStreak);
      }
      currentStreak = 0;
    }
  });

  return {
    max_consecutive_losses: maxStreak,
    current_consecutive_losses: currentStreak,
    avg_consecutive_losses: streaks.reduce((a, b) => a + b, 0) / streaks.length,
    recovery_pattern: analyzeRecoveryPattern(trades, streaks),
  };
}
```

## 8. 월간/분기별 리포트

### 8.1 월간 성과 리포트

```typescript
async function generateMonthlyReport(month: string): Promise<string> {
  const trades = await getTradesForMonth(month);
  const winRate = calculateWinRate(trades.map(t => t.outcome!));
  const avgPnL = calculateAveragePnL(trades.map(t => t.outcome!));
  const profitFactor = calculateProfitFactor(trades.map(t => t.outcome!));
  const expectancy = calculateExpectancy(trades.map(t => t.outcome!));
  const failurePatterns = identifyFailurePatterns(trades);

  return `
# 월간 거래 리포트 - ${month}

## 1. 종합 통계
- 총 거래: ${winRate.total_trades}
- 승리: ${winRate.winning_trades} (${(winRate.win_rate * 100).toFixed(1)}%)
- 손실: ${winRate.losing_trades} (${(winRate.loss_rate * 100).toFixed(1)}%)
- 평균 수익: ${avgPnL.avg_win.toFixed(2)}%
- 평균 손실: ${avgPnL.avg_loss.toFixed(2)}%
- 수익 팩터: ${profitFactor.toFixed(2)}
- 거래당 기대값: ${expectancy.toFixed(2)}%

## 2. 주요 실패 패턴
${failurePatterns.map(p => `- ${p.pattern_name}: ${p.occurrences}건 (평균 ${p.avg_loss.toFixed(2)}%)`).join('\n')}

## 3. 전략별 성과
${analyzeByStrategy(trades).map(s => `- ${s.strategy_name}: 승률 ${(s.win_rate * 100).toFixed(1)}%, 평균 ${s.avg_pnl.toFixed(2)}%`).join('\n')}

## 4. 개선 권장사항
${generateImprovementRecommendations(trades)}
  `;
}
```

## 9. 참고 문헌

1. **The New Trading for a Living** - Alexander Elder
   - 거래 일지 및 성과 분석 방법

2. **Trade Your Way to Financial Freedom** - Van K. Tharp
   - 기대값 및 시스템 평가

3. **Evidence-Based Technical Analysis** - David Aronson
   - 통계적 성과 측정

4. **Algorithmic Trading** - Ernest Chan
   - 백테스트 및 성과 지표

5. **Market Wizards** - Jack Schwager
   - 전문 트레이더의 성과 분석 사례

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
