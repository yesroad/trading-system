import { DateTime } from 'luxon';
import { createLogger } from '@workspace/shared-utils';
import type {
  Strategy,
  BacktestConfig,
  WalkForwardConfig,
  WalkForwardResult,
  WalkForwardWindow,
  WalkForwardWindowResult,
  PerformanceMetrics,
} from '../types.js';
import { runBacktest } from './backtest.js';
import Big from 'big.js';

const logger = createLogger('walk-forward');

/**
 * Walk-Forward 분석 실행
 *
 * @param strategy - 전략
 * @param config - 백테스트 설정
 * @param wfConfig - Walk-Forward 설정
 * @returns Walk-Forward 결과
 */
export async function runWalkForward(
  strategy: Strategy,
  config: BacktestConfig,
  wfConfig: WalkForwardConfig
): Promise<WalkForwardResult> {
  logger.info('Walk-Forward 분석 시작', {
    strategy: strategy.name,
    symbol: config.symbol,
    inSampleDays: wfConfig.inSampleDays,
    outSampleDays: wfConfig.outSampleDays,
    stepDays: wfConfig.stepDays,
  });

  // 1. 전체 기간을 윈도우로 분할
  const windows = generateWindows(config.startDate, config.endDate, wfConfig);

  logger.info('윈도우 생성 완료', { windowCount: windows.length });

  const minOosTrades = wfConfig.minOosTrades ?? 3;
  const warmupDays = wfConfig.warmupDays ?? 0;

  // 2. 각 윈도우에서 백테스트 실행
  const windowResults: WalkForwardWindowResult[] = [];

  for (const window of windows) {
    logger.info('윈도우 처리 시작', {
      inSampleStart: window.inSampleStart,
      outSampleEnd: window.outSampleEnd,
    });

    let inSampleResult;
    let outSampleResult;

    // 워밍업: IS/OOS 시작일을 앞당겨 MA 지표 계산에 충분한 캔들 확보
    // 200MA 필터 사용 시 warmupDays=210 권장 (약 200 거래일)
    const isStartWithWarmup = warmupDays > 0
      ? DateTime.fromISO(window.inSampleStart)
          .minus({ days: warmupDays })
          .toISODate() ?? window.inSampleStart
      : window.inSampleStart;

    const oosStartWithWarmup = warmupDays > 0
      ? DateTime.fromISO(window.outSampleStart)
          .minus({ days: warmupDays })
          .toISODate() ?? window.outSampleStart
      : window.outSampleStart;

    try {
      // In-Sample 백테스트 (워밍업 기간 포함 로드)
      inSampleResult = await runBacktest(strategy, {
        ...config,
        startDate: isStartWithWarmup,
        endDate: window.inSampleEnd,
      });

      // Out-of-Sample 백테스트 (워밍업 기간 포함 로드)
      outSampleResult = await runBacktest(strategy, {
        ...config,
        startDate: oosStartWithWarmup,
        endDate: window.outSampleEnd,
      });
    } catch (err) {
      // 데이터 없음 등의 에러 → 이 윈도우를 insufficient_trades로 처리하고 계속
      logger.warn('윈도우 처리 실패 (스킵)', {
        inSampleStart: window.inSampleStart,
        outSampleEnd: window.outSampleEnd,
        error: String(err),
      });
      continue;
    }

    // OOS 거래 수 = SELL 거래 수 (완결된 라운드트립)
    const oosTrades = outSampleResult.trades.filter((t) => t.side === 'SELL').length;
    const status: import('../types.js').WalkForwardWindowStatus =
      oosTrades >= minOosTrades ? 'valid' : 'insufficient_trades';

    windowResults.push({
      window,
      inSampleResult,
      outSampleResult,
      status,
      oosTrades,
    });

    logger.info('윈도우 처리 완료', {
      inSampleReturn: `${inSampleResult.totalReturn.toFixed(2)}%`,
      outSampleReturn: `${outSampleResult.totalReturn.toFixed(2)}%`,
      oosTrades,
      status,
    });
  }

  if (windowResults.length === 0) {
    throw new Error('유효한 윈도우가 없습니다. 데이터 기간을 확인해주세요.');
  }

  // 3. 전체 In-Sample 및 Out-of-Sample 성과 집계
  //    OOS 집계는 valid 윈도우만 포함 (insufficient_trades 제외)
  const validWindows = windowResults.filter((wr) => wr.status === 'valid');
  const inSampleMetrics = aggregateMetrics(
    windowResults.map((wr) => wr.inSampleResult.metrics)
  );
  const outSampleMetrics = aggregateMetrics(
    (validWindows.length > 0 ? validWindows : windowResults).map((wr) => wr.outSampleResult.metrics)
  );
  const aggregatedMetrics = aggregateMetrics([inSampleMetrics, outSampleMetrics]);

  logger.info('Walk-Forward 분석 완료', {
    inSampleSharpe: inSampleMetrics.sharpeRatio.toFixed(2),
    outSampleSharpe: outSampleMetrics.sharpeRatio.toFixed(2),
    aggregatedSharpe: aggregatedMetrics.sharpeRatio.toFixed(2),
  });

  return {
    strategy: strategy.name,
    symbol: config.symbol,
    config: wfConfig,
    windows: windowResults,
    aggregatedMetrics,
    inSampleMetrics,
    outSampleMetrics,
  };
}

/**
 * Walk-Forward 윈도우 생성
 *
 * @param startDate - 전체 시작 날짜
 * @param endDate - 전체 종료 날짜
 * @param config - Walk-Forward 설정
 * @returns 윈도우 배열
 */
function generateWindows(
  startDate: string,
  endDate: string,
  config: WalkForwardConfig
): WalkForwardWindow[] {
  const windows: WalkForwardWindow[] = [];
  let currentStart = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);

  while (currentStart.plus({ days: config.inSampleDays + config.outSampleDays }) <= end) {
    const inSampleStart = currentStart.toISODate();
    const inSampleEnd = currentStart.plus({ days: config.inSampleDays }).toISODate();
    const outSampleStart = currentStart
      .plus({ days: config.inSampleDays })
      .plus({ days: 1 })
      .toISODate();
    const outSampleEnd = currentStart
      .plus({ days: config.inSampleDays + config.outSampleDays })
      .toISODate();

    if (!inSampleStart || !inSampleEnd || !outSampleStart || !outSampleEnd) {
      break;
    }

    windows.push({
      inSampleStart,
      inSampleEnd,
      outSampleStart,
      outSampleEnd,
    });

    // 다음 윈도우로 이동
    currentStart = currentStart.plus({ days: config.stepDays });
  }

  return windows;
}

/**
 * 여러 성과 지표를 집계 (평균)
 *
 * @param metrics - 성과 지표 배열
 * @returns 집계된 성과 지표
 */
function aggregateMetrics(metrics: PerformanceMetrics[]): PerformanceMetrics {
  if (metrics.length === 0) {
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

  const avgTotalReturn =
    metrics.reduce((sum, m) => sum + m.totalReturn, 0) / metrics.length;
  const avgSharpeRatio =
    metrics.reduce((sum, m) => sum + m.sharpeRatio, 0) / metrics.length;
  const avgMaxDrawdown =
    metrics.reduce((sum, m) => sum + m.maxDrawdown, 0) / metrics.length;
  const avgWinRate = metrics.reduce((sum, m) => sum + m.winRate, 0) / metrics.length;
  const avgProfitFactor =
    metrics.reduce((sum, m) => sum + m.profitFactor, 0) / metrics.length;

  const totalAvgWin = metrics.reduce(
    (sum, m) => sum.plus(m.avgWin),
    new Big(0)
  );
  const totalAvgLoss = metrics.reduce(
    (sum, m) => sum.plus(m.avgLoss),
    new Big(0)
  );

  const avgTradeDuration =
    metrics.reduce((sum, m) => sum + m.avgTradeDuration, 0) / metrics.length;

  const totalTrades = metrics.reduce((sum, m) => sum + m.totalTrades, 0);
  const winningTrades = metrics.reduce((sum, m) => sum + m.winningTrades, 0);
  const losingTrades = metrics.reduce((sum, m) => sum + m.losingTrades, 0);

  return {
    totalReturn: avgTotalReturn,
    sharpeRatio: avgSharpeRatio,
    maxDrawdown: avgMaxDrawdown,
    winRate: avgWinRate,
    profitFactor: avgProfitFactor,
    avgWin: totalAvgWin.div(metrics.length),
    avgLoss: totalAvgLoss.div(metrics.length),
    totalTrades,
    winningTrades,
    losingTrades,
    avgTradeDuration,
  };
}
