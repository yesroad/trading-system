export type { Nullable } from '@workspace/shared-utils';

// =============================================================================
// Trading Signals
// =============================================================================
export interface TradingSignal {
  id: string;
  symbol: string;
  market: 'CRYPTO' | 'KRX' | 'US';
  broker: 'KIS' | 'UPBIT';
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  entry_price: string;
  target_price: string;
  stop_loss: string;
  confidence: number;
  reason: string | null;
  indicators: Record<string, unknown> | null;
  created_at: string;
  consumed_at: string | null;
  ai_analysis_id: string | null;
}

export interface InsertTradingSignalParams {
  symbol: string;
  market: 'CRYPTO' | 'KRX' | 'US';
  broker: 'KIS' | 'UPBIT';
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  entry_price: string;
  target_price: string;
  stop_loss: string;
  confidence: number;
  reason?: string;
  indicators?: Record<string, unknown>;
  ai_analysis_id?: string;
}

// =============================================================================
// Risk Events
// =============================================================================
export interface RiskEvent {
  id: string;
  event_type: 'circuit_breaker' | 'leverage_violation' | 'exposure_limit' | 'stop_loss_violation';
  violation_type: string | null;
  symbol: string | null;
  violation_details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export interface LogRiskEventParams {
  event_type: 'circuit_breaker' | 'leverage_violation' | 'exposure_limit' | 'stop_loss_violation';
  violation_type?: string;
  symbol?: string;
  violation_details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

// =============================================================================
// ACE Logs
// =============================================================================
export interface ACELog {
  id: string;
  symbol: string;
  market: 'CRYPTO' | 'KRX' | 'US';
  broker: 'KIS' | 'UPBIT';
  aspiration: Record<string, unknown>;
  capability: Record<string, unknown>;
  execution: Record<string, unknown>;
  outcome: Record<string, unknown> | null;
  trade_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateACELogParams {
  symbol: string;
  market: 'CRYPTO' | 'KRX' | 'US';
  broker: 'KIS' | 'UPBIT';
  aspiration: Record<string, unknown>;
  capability: Record<string, unknown>;
  execution: Record<string, unknown>;
  trade_id?: string;
}

// =============================================================================
// Market Breadth
// =============================================================================
export interface MarketBreadth {
  id: string;
  market: 'KRX' | 'US';
  breadth_index: number;
  uptrend_ratio: number;
  advance_decline_line: number | null;
  mcclellan_oscillator: number | null;
  analysis_time: string;
  created_at: string;
}

export interface UpsertMarketBreadthParams {
  market: 'KRX' | 'US';
  breadth_index: number;
  uptrend_ratio: number;
  advance_decline_line?: number;
  mcclellan_oscillator?: number;
  analysis_time: string;
}

// =============================================================================
// News Events
// =============================================================================
export interface NewsEvent {
  id: string;
  title: string;
  source: string | null;
  impact_score: number;
  affected_symbols: string[] | null;
  affected_sectors: string[] | null;
  price_impact: number | null;
  spread_range: number | null;
  persistence_days: number | null;
  event_time: string;
  created_at: string;
}

export interface InsertNewsEventParams {
  title: string;
  source?: string;
  impact_score: number;
  affected_symbols?: string[];
  affected_sectors?: string[];
  price_impact?: number;
  spread_range?: number;
  persistence_days?: number;
  event_time: string;
}
