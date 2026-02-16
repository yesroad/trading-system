/**
 * Backtest Engine
 *
 * 전문가급 백테스팅 프레임워크
 * - Walk-Forward 분석
 * - 슬리피지 모델링 (Fixed, Linear, Square Root)
 * - 성과 지표 (Sharpe, Max DD, Win Rate, Profit Factor)
 */

// 타입
export type * from './types.js';

// 데이터 로더
export { loadCandles, calculateAvgVolume, estimateBidAskSpread } from './data/loader.js';

// 슬리피지 모델
export { calculateSlippage, applySlippage, SLIPPAGE_PRESETS } from './models/slippage.js';

// 성과 지표
export {
  calculateMetrics,
  calculateTotalReturn,
  calculateSharpeRatio,
  calculateMaxDrawdown,
  calculateWinRate,
  calculateProfitFactor,
  calculateAvgWinLoss,
  calculateAvgTradeDuration,
  calculateDrawdowns,
} from './metrics/calculator.js';

// 백테스트 엔진
export { runBacktest } from './engine/backtest.js';
export { runWalkForward } from './engine/walk-forward.js';

// 리포트
export {
  generateBacktestReport,
  generateWalkForwardReport,
  validatePerformance,
} from './reports/reporter.js';

// 전략
export { SimpleMAStrategy } from './strategies/simple-ma-crossover.js';
