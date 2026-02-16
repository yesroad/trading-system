// Main exports for @workspace/stock-screener

// Types
export type {
  DividendScreeningCriteria,
  DividendMetrics,
  ScreenedStock,
  ScreeningResult,
  FMPStock,
  FMPKeyMetrics,
  FMPDividendHistory,
} from './types.js';

// Dividend Screener
export { screenDividendStocks, getTopDividendStocks } from './dividend/screener.js';

// Dividend Metrics
export {
  calculateDividendMetrics,
  calculateDividendYield,
  calculatePayoutRatio,
  assessSustainability,
  calculateCompositeScore,
} from './dividend/metrics.js';

// FMP API Client
export {
  searchStocks,
  getKeyMetrics,
  getDividendHistory,
  calculate3YearDividendCAGR,
  batchGetKeyMetrics,
} from './api/fmp-client.js';
