import type { BacktestResult, WalkForwardResult, PerformanceMetrics, WalkForwardWindowResult } from '../types.js';

/**
 * 백테스트 결과 리포트 생성
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
 */
export function generateWalkForwardReport(result: WalkForwardResult): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(60));
  lines.push('Walk-Forward 분석 결과');
  lines.push('='.repeat(60));
  lines.push('');

  // 기본 정보
  const validCount = result.windows.filter((w) => w.status === 'valid').length;
  const insufficientCount = result.windows.filter((w) => w.status === 'insufficient_trades').length;

  lines.push('## 기본 정보');
  lines.push(`전략명: ${result.strategy}`);
  lines.push(`심볼: ${result.symbol}`);
  lines.push(`In-Sample 기간: ${result.config.inSampleDays}일`);
  lines.push(`Out-of-Sample 기간: ${result.config.outSampleDays}일`);
  lines.push(`이동 간격: ${result.config.stepDays}일`);
  lines.push(`총 윈도우 수: ${result.windows.length} (평가가능: ${validCount}, 거래부족: ${insufficientCount})`);
  if (result.config.minOosTrades) {
    lines.push(`OOS 최소 거래 수: ${result.config.minOosTrades}`);
  }
  lines.push('');

  // OOS 일관성 평가 (항상 표시)
  const consistency = calculateOosConsistency(result.windows);
  lines.push('## OOS 일관성 평가');
  lines.push(`  Positive Windows: ${consistency.positiveCount} / ${consistency.totalValid} (${consistency.positiveRatioPct.toFixed(1)}%)`);
  lines.push(`  Median OOS Return: ${consistency.medianReturn.toFixed(2)}%`);
  lines.push(`  Status: ${consistency.passed ? 'PASS' : 'FAIL'}`);
  if (!consistency.passed) {
    for (const reason of consistency.failures) {
      lines.push(`  * ${reason}`);
    }
  }
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
  lines.push(`### Out-of-Sample 성과 (평가가능 윈도우 ${validCount}개 기준)`);
  lines.push(...formatMetrics(result.outSampleMetrics));
  lines.push('');

  // 윈도우별 상세 결과
  lines.push('## 윈도우별 결과');
  for (let i = 0; i < result.windows.length; i++) {
    const windowResult = result.windows[i]!;
    const statusLabel =
      windowResult.status === 'insufficient_trades'
        ? ` [거래부족: ${windowResult.oosTrades}건 < 기준]`
        : ` [유효: OOS ${windowResult.oosTrades}건]`;

    lines.push(`### 윈도우 ${i + 1}${statusLabel}`);
    lines.push(
      `In-Sample: ${windowResult.window.inSampleStart} ~ ${windowResult.window.inSampleEnd}`
    );
    lines.push(
      `Out-of-Sample: ${windowResult.window.outSampleStart} ~ ${windowResult.window.outSampleEnd}`
    );
    lines.push(
      `In-Sample 수익률: ${windowResult.inSampleResult.totalReturn.toFixed(2)}% | Sharpe: ${windowResult.inSampleResult.metrics.sharpeRatio.toFixed(2)}`
    );

    if (windowResult.status === 'valid') {
      lines.push(
        `Out-of-Sample 수익률: ${windowResult.outSampleResult.totalReturn.toFixed(2)}% | Sharpe: ${windowResult.outSampleResult.metrics.sharpeRatio.toFixed(2)} | MDD: ${windowResult.outSampleResult.metrics.maxDrawdown.toFixed(2)}%`
      );
    } else {
      lines.push(
        `Out-of-Sample: 거래 수 부족 (${windowResult.oosTrades}건) — 이 윈도우는 OOS 집계에서 제외됨`
      );
    }
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
 * OOS 일관성 계산
 *
 * valid 윈도우 기준:
 * - Positive Windows: OOS 수익률 ≥ 0 비율
 * - Median OOS Return: 중앙값 수익률
 * - 합격: positiveRatio ≥ 40% AND median ≥ 0%
 */
function calculateOosConsistency(windows: WalkForwardWindowResult[]): {
  positiveCount: number;
  totalValid: number;
  positiveRatioPct: number;
  medianReturn: number;
  passed: boolean;
  failures: string[];
} {
  const validWindows = windows.filter((w) => w.status === 'valid');
  const oosReturns = validWindows.map((w) => w.outSampleResult.totalReturn);

  if (oosReturns.length === 0) {
    return {
      positiveCount: 0,
      totalValid: 0,
      positiveRatioPct: 0,
      medianReturn: 0,
      passed: false,
      failures: ['평가가능 윈도우 없음 (OOS 거래 수 기준 미달)'],
    };
  }

  const positiveCount = oosReturns.filter((r) => r >= 0).length;
  const positiveRatioPct = (positiveCount / oosReturns.length) * 100;

  const sorted = [...oosReturns].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianReturn =
    sorted.length % 2 === 0
      ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
      : (sorted[mid] ?? 0);

  const failures: string[] = [];
  if (positiveRatioPct < 40) {
    failures.push(
      `Positive Windows ${positiveRatioPct.toFixed(1)}% < 40% (수익 윈도우 부족)`
    );
  }
  if (medianReturn < 0) {
    failures.push(`Median OOS Return ${medianReturn.toFixed(2)}% < 0% (중앙값 손실)`);
  }

  return {
    positiveCount,
    totalValid: oosReturns.length,
    positiveRatioPct,
    medianReturn,
    passed: failures.length === 0,
    failures,
  };
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
 * 성과 검증 (합격 기준 — OOS 중심으로 완화)
 *
 * 필수:
 *   Sharpe Ratio ≥ 0.3
 *   Max Drawdown ≤ 25%
 *   Profit Factor ≥ 1.1
 *   (WinRate 필수 제외 — 추세추종 전략의 낮은 승률 허용)
 *
 * 우수:
 *   Sharpe Ratio ≥ 1.0
 *   Max Drawdown ≤ 15%
 *   Profit Factor ≥ 1.5
 */
export function validatePerformance(metrics: PerformanceMetrics): {
  passed: boolean;
  excellent: boolean;
  failures: string[];
  excellentReasons: string[];
} {
  const failures: string[] = [];
  const excellentReasons: string[] = [];

  // 필수 통과 기준
  if (metrics.sharpeRatio < 0.3) {
    failures.push(`Sharpe Ratio (${metrics.sharpeRatio.toFixed(2)}) < 0.3`);
  }

  if (metrics.maxDrawdown > 25) {
    failures.push(`Max Drawdown (${metrics.maxDrawdown.toFixed(2)}%) > 25%`);
  }

  if (metrics.profitFactor < 1.1 && metrics.totalTrades > 0) {
    failures.push(`Profit Factor (${metrics.profitFactor.toFixed(2)}) < 1.1`);
  }

  // 우수 기준
  if (metrics.sharpeRatio >= 1.0) {
    excellentReasons.push(`Sharpe Ratio (${metrics.sharpeRatio.toFixed(2)}) ≥ 1.0`);
  }
  if (metrics.maxDrawdown <= 15) {
    excellentReasons.push(`Max Drawdown (${metrics.maxDrawdown.toFixed(2)}%) ≤ 15%`);
  }
  if (metrics.profitFactor >= 1.5) {
    excellentReasons.push(`Profit Factor (${metrics.profitFactor.toFixed(2)}) ≥ 1.5`);
  }
  if (metrics.winRate >= 50) {
    excellentReasons.push(`Win Rate (${metrics.winRate.toFixed(2)}%) ≥ 50%`);
  }

  return {
    passed: failures.length === 0,
    excellent: failures.length === 0 && excellentReasons.length >= 2,
    failures,
    excellentReasons,
  };
}
