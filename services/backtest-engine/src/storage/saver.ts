import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import type { BacktestResult, WalkForwardResult } from '../types.js';
import { validatePerformance } from '../reports/reporter.js';

const logger = createLogger('backtest-saver');

const BATCH_SIZE = 500; // 자본 곡선 / 낙폭 배치 INSERT 크기

// ============================================================
// 단순 백테스트 결과 저장
// ============================================================

/**
 * 백테스트 결과를 DB에 저장하고 run_id를 반환
 */
export async function saveBacktestResult(
  result: BacktestResult,
  strategyParams?: Record<string, unknown>
): Promise<string> {
  const supabase = getSupabase();
  const validation = validatePerformance(result.metrics);

  logger.info('백테스트 결과 저장 시작', {
    strategy: result.strategy,
    symbol: result.symbol,
    trades: result.trades.length,
    equityPoints: result.equity.length,
  });

  // 1. backtest_runs 삽입
  const { data: run, error: runError } = await supabase
    .from('backtest_runs')
    .insert({
      strategy: result.strategy,
      symbol: result.symbol,
      start_date: result.startDate,
      end_date: result.endDate,
      initial_capital: result.initialCapital.toString(),
      final_capital: result.finalCapital.toString(),
      total_return: result.totalReturn,
      sharpe_ratio: result.metrics.sharpeRatio,
      max_drawdown: result.metrics.maxDrawdown,
      win_rate: result.metrics.winRate,
      profit_factor: result.metrics.profitFactor,
      total_trades: result.metrics.totalTrades,
      winning_trades: result.metrics.winningTrades,
      losing_trades: result.metrics.losingTrades,
      avg_trade_duration_hours: result.metrics.avgTradeDuration,
      avg_win: result.metrics.avgWin.toString(),
      avg_loss: result.metrics.avgLoss.toString(),
      run_type: 'simple',
      params: strategyParams ?? null,
      config: null,
      validation: {
        passed: validation.passed,
        failures: validation.failures,
      },
    })
    .select('id')
    .single();

  if (runError) {
    throw new Error(`backtest_runs 저장 실패: ${runError.message}`);
  }

  const runId = run.id as string;

  // 2. 자본 곡선 배치 저장
  if (result.equity.length > 0) {
    await insertInBatches(
      result.equity.map((p) => ({
        run_id: runId,
        ts: p.timestamp,
        equity: p.equity.toString(),
      })),
      'backtest_equity_curve'
    );
  }

  // 3. 낙폭 시계열 배치 저장
  if (result.drawdowns.length > 0) {
    await insertInBatches(
      result.drawdowns.map((p) => ({
        run_id: runId,
        ts: p.timestamp,
        drawdown_pct: p.drawdown,
        peak: p.peak.toString(),
      })),
      'backtest_drawdowns'
    );
  }

  logger.info('백테스트 결과 저장 완료', { runId });
  return runId;
}

// ============================================================
// Walk-Forward 결과 저장
// ============================================================

/**
 * Walk-Forward 결과를 DB에 저장하고 run_id를 반환
 *
 * 집계 지표를 backtest_runs에 저장하고,
 * 각 윈도우별 자본 곡선/낙폭은 해당 run_id 기준으로 저장
 */
export async function saveWalkForwardResult(
  result: WalkForwardResult,
  strategyParams?: Record<string, unknown>
): Promise<string> {
  const supabase = getSupabase();
  const validation = validatePerformance(result.outSampleMetrics);

  logger.info('Walk-Forward 결과 저장 시작', {
    strategy: result.strategy,
    symbol: result.symbol,
    windows: result.windows.length,
  });

  // 전체 기간 계산
  const firstWindow = result.windows[0];
  const lastWindow = result.windows[result.windows.length - 1];
  const startDate = firstWindow?.window.inSampleStart ?? '';
  const endDate = lastWindow?.window.outSampleEnd ?? '';

  // 1. backtest_runs 삽입 (집계 지표 기준)
  const { data: run, error: runError } = await supabase
    .from('backtest_runs')
    .insert({
      strategy: result.strategy,
      symbol: result.symbol,
      start_date: startDate,
      end_date: endDate,
      initial_capital: result.windows[0]?.inSampleResult.initialCapital.toString() ?? '0',
      final_capital: result.windows[result.windows.length - 1]?.outSampleResult.finalCapital.toString() ?? '0',
      total_return: result.aggregatedMetrics.totalReturn,
      sharpe_ratio: result.aggregatedMetrics.sharpeRatio,
      max_drawdown: result.aggregatedMetrics.maxDrawdown,
      win_rate: result.aggregatedMetrics.winRate,
      profit_factor: result.aggregatedMetrics.profitFactor,
      total_trades: result.aggregatedMetrics.totalTrades,
      winning_trades: result.aggregatedMetrics.winningTrades,
      losing_trades: result.aggregatedMetrics.losingTrades,
      avg_trade_duration_hours: result.aggregatedMetrics.avgTradeDuration,
      avg_win: result.aggregatedMetrics.avgWin.toString(),
      avg_loss: result.aggregatedMetrics.avgLoss.toString(),
      run_type: 'walk_forward',
      params: strategyParams ?? null,
      config: {
        inSampleDays: result.config.inSampleDays,
        outSampleDays: result.config.outSampleDays,
        stepDays: result.config.stepDays,
        inSampleMetrics: metricsToPlain(result.inSampleMetrics),
        outSampleMetrics: metricsToPlain(result.outSampleMetrics),
      },
      validation: {
        passed: validation.passed,
        failures: validation.failures,
      },
    })
    .select('id')
    .single();

  if (runError) {
    throw new Error(`backtest_runs 저장 실패: ${runError.message}`);
  }

  const runId = run.id as string;

  // 2. Out-of-Sample 자본 곡선 + 낙폭 (모든 윈도우 병합)
  const allEquity = result.windows.flatMap((w) => w.outSampleResult.equity);
  const allDrawdowns = result.windows.flatMap((w) => w.outSampleResult.drawdowns);

  if (allEquity.length > 0) {
    await insertInBatches(
      allEquity.map((p) => ({
        run_id: runId,
        ts: p.timestamp,
        equity: p.equity.toString(),
      })),
      'backtest_equity_curve'
    );
  }

  if (allDrawdowns.length > 0) {
    await insertInBatches(
      allDrawdowns.map((p) => ({
        run_id: runId,
        ts: p.timestamp,
        drawdown_pct: p.drawdown,
        peak: p.peak.toString(),
      })),
      'backtest_drawdowns'
    );
  }

  logger.info('Walk-Forward 결과 저장 완료', { runId });
  return runId;
}

// ============================================================
// 내부 유틸
// ============================================================

async function insertInBatches(
  rows: Record<string, unknown>[],
  table: string
): Promise<void> {
  const supabase = getSupabase();

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);

    if (error) {
      throw new Error(`${table} 배치 저장 실패 (offset ${i}): ${error.message}`);
    }
  }
}

function metricsToPlain(
  m: BacktestResult['metrics']
): Record<string, number | string> {
  return {
    totalReturn: m.totalReturn,
    sharpeRatio: m.sharpeRatio,
    maxDrawdown: m.maxDrawdown,
    winRate: m.winRate,
    profitFactor: m.profitFactor,
    totalTrades: m.totalTrades,
    winningTrades: m.winningTrades,
    losingTrades: m.losingTrades,
    avgTradeDuration: m.avgTradeDuration,
    avgWin: m.avgWin.toString(),
    avgLoss: m.avgLoss.toString(),
  };
}
