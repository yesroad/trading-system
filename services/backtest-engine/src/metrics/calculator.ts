import Big from 'big.js';
import { DateTime } from 'luxon';
import type { Trade, PerformanceMetrics, EquityPoint, DrawdownPoint } from '../types.js';

/**
 * 성과 지표 계산
 *
 * @param trades - 거래 목록
 * @param equity - 자본 곡선
 * @param initialCapital - 초기 자본
 * @returns 성과 지표
 */
export function calculateMetrics(
  trades: Trade[],
  equity: EquityPoint[],
  initialCapital: Big
): PerformanceMetrics {
  if (trades.length === 0) {
    return {
      totalReturn: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      avgWin: new Big(0),
      avgLoss: new Big(0),
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      avgTradeDuration: 0,
    };
  }

  const finalCapital = equity[equity.length - 1]?.equity ?? initialCapital;
  const totalReturn = calculateTotalReturn(initialCapital, finalCapital);
  const sharpeRatio = calculateSharpeRatio(equity, initialCapital);
  const maxDrawdown = calculateMaxDrawdown(equity);
  const { winRate, winningTrades, losingTrades } = calculateWinRate(trades);
  const profitFactor = calculateProfitFactor(trades);
  const { avgWin, avgLoss } = calculateAvgWinLoss(trades);
  const avgTradeDuration = calculateAvgTradeDuration(trades);

  return {
    totalReturn,
    sharpeRatio,
    maxDrawdown,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    avgTradeDuration,
  };
}

/**
 * 총 수익률 계산
 *
 * @param initialCapital - 초기 자본
 * @param finalCapital - 최종 자본
 * @returns 수익률 (%)
 */
export function calculateTotalReturn(initialCapital: Big, finalCapital: Big): number {
  if (initialCapital.lte(0)) {
    return 0;
  }

  return finalCapital
    .minus(initialCapital)
    .div(initialCapital)
    .times(100)
    .toNumber();
}

/**
 * Sharpe Ratio 계산
 *
 * 가정: 무위험 수익률 = 0
 * Sharpe = (평균 수익률) / (수익률 표준편차) × sqrt(252)
 *
 * @param equity - 자본 곡선
 * @param initialCapital - 초기 자본
 * @returns Sharpe Ratio
 */
export function calculateSharpeRatio(equity: EquityPoint[], initialCapital: Big): number {
  if (equity.length < 2) {
    return 0;
  }

  // 일일 수익률 계산
  const dailyReturns: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prevEquity = equity[i - 1]!.equity;
    const currEquity = equity[i]!.equity;

    if (prevEquity.gt(0)) {
      const dailyReturn = currEquity.minus(prevEquity).div(prevEquity).toNumber();
      dailyReturns.push(dailyReturn);
    }
  }

  if (dailyReturns.length === 0) {
    return 0;
  }

  // 평균 수익률
  const avgReturn = dailyReturns.reduce((sum, r) => sum + r, 0) / dailyReturns.length;

  // 표준편차
  const variance =
    dailyReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) /
    dailyReturns.length;
  const stdDev = Math.sqrt(variance);

  if (stdDev === 0) {
    return 0;
  }

  // 연율화 (거래일 252일 가정)
  const sharpeRatio = (avgReturn / stdDev) * Math.sqrt(252);
  return sharpeRatio;
}

/**
 * 최대 낙폭 (Max Drawdown) 계산
 *
 * @param equity - 자본 곡선
 * @returns 최대 낙폭 (%)
 */
export function calculateMaxDrawdown(equity: EquityPoint[]): number {
  if (equity.length === 0) {
    return 0;
  }

  let maxDrawdown = 0;
  let peak = equity[0]!.equity;

  for (const point of equity) {
    if (point.equity.gt(peak)) {
      peak = point.equity;
    }

    if (peak.gt(0)) {
      const drawdown = peak.minus(point.equity).div(peak).times(100).toNumber();
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
  }

  return maxDrawdown;
}

/**
 * 승률 계산
 *
 * @param trades - 거래 목록
 * @returns 승률, 승리 거래 수, 손실 거래 수
 */
export function calculateWinRate(trades: Trade[]): {
  winRate: number;
  winningTrades: number;
  losingTrades: number;
} {
  if (trades.length === 0) {
    return { winRate: 0, winningTrades: 0, losingTrades: 0 };
  }

  let winningTrades = 0;
  let losingTrades = 0;

  for (const trade of trades) {
    if (trade.realizedPnL && trade.realizedPnL.gt(0)) {
      winningTrades++;
    } else if (trade.realizedPnL && trade.realizedPnL.lt(0)) {
      losingTrades++;
    }
  }

  const winRate = (winningTrades / trades.length) * 100;
  return { winRate, winningTrades, losingTrades };
}

/**
 * Profit Factor 계산
 *
 * Profit Factor = 총 수익 / 총 손실
 *
 * @param trades - 거래 목록
 * @returns Profit Factor
 */
export function calculateProfitFactor(trades: Trade[]): number {
  let totalProfit = new Big(0);
  let totalLoss = new Big(0);

  for (const trade of trades) {
    if (trade.realizedPnL) {
      if (trade.realizedPnL.gt(0)) {
        totalProfit = totalProfit.plus(trade.realizedPnL);
      } else if (trade.realizedPnL.lt(0)) {
        totalLoss = totalLoss.plus(trade.realizedPnL.abs());
      }
    }
  }

  if (totalLoss.lte(0)) {
    return totalProfit.gt(0) ? Infinity : 0;
  }

  return totalProfit.div(totalLoss).toNumber();
}

/**
 * 평균 승리/손실 금액 계산
 *
 * @param trades - 거래 목록
 * @returns 평균 승리, 평균 손실
 */
export function calculateAvgWinLoss(trades: Trade[]): {
  avgWin: Big;
  avgLoss: Big;
} {
  let totalWin = new Big(0);
  let totalLoss = new Big(0);
  let winCount = 0;
  let lossCount = 0;

  for (const trade of trades) {
    if (trade.realizedPnL) {
      if (trade.realizedPnL.gt(0)) {
        totalWin = totalWin.plus(trade.realizedPnL);
        winCount++;
      } else if (trade.realizedPnL.lt(0)) {
        totalLoss = totalLoss.plus(trade.realizedPnL.abs());
        lossCount++;
      }
    }
  }

  const avgWin = winCount > 0 ? totalWin.div(winCount) : new Big(0);
  const avgLoss = lossCount > 0 ? totalLoss.div(lossCount) : new Big(0);

  return { avgWin, avgLoss };
}

/**
 * 평균 거래 지속 시간 계산 (시간 단위)
 *
 * @param trades - 거래 목록
 * @returns 평균 지속 시간 (시간)
 */
export function calculateAvgTradeDuration(trades: Trade[]): number {
  if (trades.length < 2) {
    return 0;
  }

  // 매수와 매도를 페어로 묶어 지속 시간 계산
  const durations: number[] = [];
  let lastBuyTimestamp: string | null = null;

  for (const trade of trades) {
    if (trade.side === 'BUY') {
      lastBuyTimestamp = trade.timestamp;
    } else if (trade.side === 'SELL' && lastBuyTimestamp) {
      const buyTime = DateTime.fromISO(lastBuyTimestamp);
      const sellTime = DateTime.fromISO(trade.timestamp);
      const durationHours = sellTime.diff(buyTime, 'hours').hours;
      durations.push(durationHours);
      lastBuyTimestamp = null;
    }
  }

  if (durations.length === 0) {
    return 0;
  }

  const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  return avgDuration;
}

/**
 * Drawdown 포인트 계산
 *
 * @param equity - 자본 곡선
 * @returns Drawdown 포인트 배열
 */
export function calculateDrawdowns(equity: EquityPoint[]): DrawdownPoint[] {
  if (equity.length === 0) {
    return [];
  }

  const drawdowns: DrawdownPoint[] = [];
  let peak = equity[0]!.equity;

  for (const point of equity) {
    if (point.equity.gt(peak)) {
      peak = point.equity;
    }

    const drawdown =
      peak.gt(0) ? peak.minus(point.equity).div(peak).times(100).toNumber() : 0;

    drawdowns.push({
      timestamp: point.timestamp,
      drawdown,
      peak,
    });
  }

  return drawdowns;
}
