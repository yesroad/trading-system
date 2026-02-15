import Big from 'big.js';

// =============================================================================
// Candle Data
// =============================================================================

/**
 * OHLCV candle data
 */
export interface Candle {
  time: string | Date;
  open: string | number;
  high: string | number;
  low: string | number;
  close: string | number;
  volume: string | number;
}

/**
 * Normalized candle with Big.js values
 */
export interface NormalizedCandle {
  time: Date;
  open: Big;
  high: Big;
  low: Big;
  close: Big;
  volume: Big;
}

// =============================================================================
// Indicators
// =============================================================================

/**
 * Moving Average types
 */
export type MAType = 'SMA' | 'EMA' | 'WMA';

/**
 * MACD result
 */
export interface MACDResult {
  macd: Big;
  signal: Big;
  histogram: Big;
}

/**
 * RSI result
 */
export interface RSIResult {
  value: Big;
  overbought: boolean;  // > 70
  oversold: boolean;    // < 30
}

/**
 * Volume analysis result
 */
export interface VolumeAnalysis {
  avgVolume: Big;
  currentVolume: Big;
  volumeRatio: Big;      // current / avg
  isHighVolume: boolean; // ratio > 1.5
}

/**
 * Support/Resistance level
 */
export interface SupportResistanceLevel {
  price: Big;
  type: 'support' | 'resistance';
  strength: number;  // 0-1
  touches: number;   // Number of times price touched this level
}

/**
 * Indicator score for confidence calculation
 */
export interface IndicatorScore {
  name: string;
  score: number;  // 0-1
  weight: number; // 0-1
}

// =============================================================================
// Risk Management
// =============================================================================

/**
 * Position sizing parameters
 */
export interface PositionSizingParams {
  accountSize: Big;
  riskPercentage: number;  // Default 1% = 0.01
  entry: Big;
  stopLoss: Big;
}

/**
 * Position sizing result
 */
export interface PositionSizingResult {
  positionSize: Big;       // Number of units to buy
  positionValue: Big;      // Total value in base currency
  riskAmount: Big;         // Amount at risk
  maxPositionValue: Big;   // Max allowed (25% of account)
  limitedByMaxExposure: boolean;
}

/**
 * Leverage validation result
 */
export interface LeverageValidationResult {
  valid: boolean;
  requestedLeverage: Big;
  maxLeverage: Big;
  violations: string[];
}

/**
 * Exposure tracking result
 */
export interface ExposureResult {
  valid: boolean;
  currentExposure: Big;      // As percentage of account
  newExposure: Big;          // After new position
  maxExposure: Big;          // Limit (1.0 = 100%)
  violations: string[];
}

// =============================================================================
// ATR (Average True Range)
// =============================================================================

/**
 * ATR calculation result
 */
export interface ATRResult {
  atr: Big;
  period: number;
  trueRanges: Big[];
}

/**
 * ATR-based stop loss parameters
 */
export interface ATRStopLossParams {
  entry: Big;
  atr: Big;
  multiplier?: number;  // Default 2.0
  minPct?: number;      // Default 0.5%
  maxPct?: number;      // Default 5.0%
}

/**
 * ATR-based stop loss result
 */
export interface ATRStopLossResult {
  stopLoss: Big;
  stopLossDistance: Big;  // Absolute distance
  stopLossPct: Big;       // Percentage distance
  atrMultiplier: number;
  clampedByMin: boolean;
  clampedByMax: boolean;
}

// =============================================================================
// Confidence Calculation
// =============================================================================

/**
 * Multi-timeframe signal
 */
export interface TimeframeSignal {
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  confidence: number;  // 0-1
  weight: number;      // 0-1
}

/**
 * Confidence adjustment factors
 */
export interface ConfidenceAdjustments {
  volatilityFactor: number;  // 0-1, lower = higher volatility
  trendStrength: number;     // 0-1
  volumeConfirmation: number; // 0-1
}

/**
 * Final confidence result
 */
export interface ConfidenceResult {
  rawConfidence: number;      // 0-1
  adjustedConfidence: number; // 0-1
  adjustments: ConfidenceAdjustments;
  breakdown: IndicatorScore[];
}

// =============================================================================
// Utility Types
// =============================================================================

/**
 * Direction of price movement
 */
export type Direction = 'up' | 'down' | 'neutral';

/**
 * Trend strength
 */
export type TrendStrength = 'strong' | 'moderate' | 'weak' | 'none';
