import type { BacktestResult, WalkForwardResult, PerformanceMetrics } from '../types.js';

/**
 * 백테스트 결과 리포트 생성
 *
 * @param result - 백테스트 결과
 * @returns 텍스트 리포트
 */
export function generateBacktestReport(result: BacktestResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('백테스트 결과 리포트');
  lines.push('='.repeat(60));
  lines.push('');

  // 기본 정보
  lines.push('## 기본 정보');
  lines.push(`전략명: ${result.strategy}`);
  lines.push(`심볼: ${result.symbol}`);
  lines.push(`기간: ${result.startDate} ~ ${result.endDate}`);
  lines.push(`초기 자본: ${result.initialCapital.toFixed(2)}`);
  lines.push(`최종 자본: ${result.finalCapital.toFixed(2)}`);
  lines.push(`총 수익률: ${result.totalReturn.toFixed(2)}%`);
  lines.push('');

  // 성과 지표
  lines.push('## 성과 지표');
  lines.push(...formatMetrics(result.metrics));
  lines.push('');

  // 거래 내역 요약
  lines.push('## 거래 내역');
  lines.push(`총 거래 횟수: ${result.trades.length}`);
  if (result.trades.length > 0) {
    const avgCommission =
      result.trades.reduce((sum, t) => sum.plus(t.commission), result.initialCapital.times(0)).div(result.trades.length);
    const avgSlippage =
      result.trades.reduce((sum, t) => sum.plus(t.slippage), result.initialCapital.times(0)).div(result.trades.length);

    lines.push(`평균 수수료: ${avgCommission.toFixed(4)}`);
    lines.push(`평균 슬리피지: ${avgSlippage.toFixed(4)}%`);
  }
  lines.push('');

  // 최근 10개 거래
  if (result.trades.length > 0) {
    lines.push('## 최근 거래 내역 (최대 10개)');
    const recentTrades = result.trades.slice(-10);
    for (const trade of recentTrades) {
      const pnl = trade.realizedPnL ? ` (손익: ${trade.realizedPnL.toFixed(2)})` : '';
      lines.push(
        `${trade.timestamp} | ${trade.side} | ${trade.qty.toFixed(4)} @ ${trade.price.toFixed(2)}${pnl}`
      );
    }
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}

/**
 * Walk-Forward 결과 리포트 생성
 *
 * @param result - Walk-Forward 결과
 * @returns 텍스트 리포트
 */
export function generateWalkForwardReport(result: WalkForwardResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('Walk-Forward 분석 결과');
  lines.push('='.repeat(60));
  lines.push('');

  // 기본 정보
  lines.push('## 기본 정보');
  lines.push(`전략명: ${result.strategy}`);
  lines.push(`심볼: ${result.symbol}`);
  lines.push(`In-Sample 기간: ${result.config.inSampleDays}일`);
  lines.push(`Out-of-Sample 기간: ${result.config.outSampleDays}일`);
  lines.push(`이동 간격: ${result.config.stepDays}일`);
  lines.push(`총 윈도우 수: ${result.windows.length}`);
  lines.push('');

  // 집계된 성과
  lines.push('## 전체 성과 (Aggregated)');
  lines.push(...formatMetrics(result.aggregatedMetrics));
  lines.push('');

  // In-Sample vs Out-of-Sample 비교
  lines.push('## In-Sample vs Out-of-Sample 비교');
  lines.push('');
  lines.push('### In-Sample 성과');
  lines.push(...formatMetrics(result.inSampleMetrics));
  lines.push('');
  lines.push('### Out-of-Sample 성과');
  lines.push(...formatMetrics(result.outSampleMetrics));
  lines.push('');

  // 윈도우별 상세 결과
  lines.push('## 윈도우별 결과');
  for (let i = 0; i < result.windows.length; i++) {
    const windowResult = result.windows[i]!;
    lines.push(`### 윈도우 ${i + 1}`);
    lines.push(
      `In-Sample: ${windowResult.window.inSampleStart} ~ ${windowResult.window.inSampleEnd}`
    );
    lines.push(
      `Out-of-Sample: ${windowResult.window.outSampleStart} ~ ${windowResult.window.outSampleEnd}`
    );
    lines.push(
      `In-Sample 수익률: ${windowResult.inSampleResult.totalReturn.toFixed(2)}% | Sharpe: ${windowResult.inSampleResult.metrics.sharpeRatio.toFixed(2)}`
    );
    lines.push(
      `Out-of-Sample 수익률: ${windowResult.outSampleResult.totalReturn.toFixed(2)}% | Sharpe: ${windowResult.outSampleResult.metrics.sharpeRatio.toFixed(2)}`
    );
    lines.push('');
  }

  // 과최적화 경고
  const overfit = detectOverfitting(result);
  if (overfit) {
    lines.push('## ⚠️ 과최적화 경고');
    lines.push(overfit);
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push('');

  return lines.join('\n');
}

/**
 * 성과 지표 포맷팅
 */
function formatMetrics(metrics: PerformanceMetrics): string[] {
  const lines: string[] = [];

  lines.push(`총 수익률: ${metrics.totalReturn.toFixed(2)}%`);
  lines.push(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
  lines.push(`Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%`);
  lines.push(`Win Rate: ${metrics.winRate.toFixed(2)}%`);
  lines.push(`Profit Factor: ${metrics.profitFactor.toFixed(2)}`);
  lines.push(`평균 승리: ${metrics.avgWin.toFixed(2)}`);
  lines.push(`평균 손실: ${metrics.avgLoss.toFixed(2)}`);
  lines.push(`총 거래 횟수: ${metrics.totalTrades}`);
  lines.push(`승리 거래: ${metrics.winningTrades}`);
  lines.push(`손실 거래: ${metrics.losingTrades}`);
  lines.push(`평균 거래 지속 시간: ${metrics.avgTradeDuration.toFixed(1)}시간`);

  return lines;
}

/**
 * 과최적화 탐지
 *
 * In-Sample과 Out-of-Sample 성과 차이가 크면 과최적화 경고
 */
function detectOverfitting(result: WalkForwardResult): string | null {
  const inSampleSharpe = result.inSampleMetrics.sharpeRatio;
  const outSampleSharpe = result.outSampleMetrics.sharpeRatio;

  // Sharpe Ratio 차이가 50% 이상이면 경고
  if (inSampleSharpe > 0 && outSampleSharpe / inSampleSharpe < 0.5) {
    return `In-Sample Sharpe (${inSampleSharpe.toFixed(2)})와 Out-of-Sample Sharpe (${outSampleSharpe.toFixed(2)})의 차이가 큽니다. 과최적화 가능성이 있습니다.`;
  }

  // Out-of-Sample이 음수이면 경고
  if (result.outSampleMetrics.totalReturn < 0) {
    return `Out-of-Sample 수익률이 음수입니다 (${result.outSampleMetrics.totalReturn.toFixed(2)}%). 전략이 실전에서 유효하지 않을 수 있습니다.`;
  }

  return null;
}

/**
 * 성과 검증 (필수 통과 기준)
 *
 * @param metrics - 성과 지표
 * @returns 검증 결과
 */
export function validatePerformance(metrics: PerformanceMetrics): {
  passed: boolean;
  failures: string[];
} {
  const failures: string[] = [];

  // 필수 통과 기준
  if (metrics.sharpeRatio < 1.0) {
    failures.push(`Sharpe Ratio (${metrics.sharpeRatio.toFixed(2)}) < 1.0`);
  }

  if (metrics.maxDrawdown > 20) {
    failures.push(`Max Drawdown (${metrics.maxDrawdown.toFixed(2)}%) > 20%`);
  }

  if (metrics.winRate < 45) {
    failures.push(`Win Rate (${metrics.winRate.toFixed(2)}%) < 45%`);
  }

  if (metrics.profitFactor < 1.5) {
    failures.push(`Profit Factor (${metrics.profitFactor.toFixed(2)}) < 1.5`);
  }

  return {
    passed: failures.length === 0,
    failures,
  };
}
