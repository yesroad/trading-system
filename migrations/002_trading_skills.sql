-- Migration: Trading Skills Integration
-- Description: Creates 5 new tables for signal generation, risk management, ACE logging, market analysis
-- Author: Claude Code
-- Date: 2026-02-15

-- =============================================================================
-- Table 1: trading_signals - Generated trading signals
-- =============================================================================
CREATE TABLE IF NOT EXISTS trading_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KRW', 'KRX', 'US')),
  broker TEXT NOT NULL CHECK (broker IN ('KIS', 'UPBIT')),
  signal_type TEXT NOT NULL CHECK (signal_type IN ('BUY', 'SELL', 'HOLD')),
  entry_price DECIMAL NOT NULL CHECK (entry_price > 0),
  target_price DECIMAL NOT NULL CHECK (target_price > 0),
  stop_loss DECIMAL NOT NULL CHECK (stop_loss > 0),
  confidence DECIMAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT,
  indicators JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,
  ai_analysis_id UUID
);

-- Indexes for trading_signals
CREATE INDEX idx_trading_signals_unconsumed
  ON trading_signals (created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX idx_trading_signals_symbol_created
  ON trading_signals (symbol, created_at DESC);

CREATE INDEX idx_trading_signals_market_broker
  ON trading_signals (market, broker, created_at DESC);

COMMENT ON TABLE trading_signals IS 'Generated trading signals from AI analysis + technical indicators';
COMMENT ON COLUMN trading_signals.confidence IS 'Blended confidence: 60% AI + 40% technical indicators';
COMMENT ON COLUMN trading_signals.consumed_at IS 'NULL = unconsumed, timestamp = when signal was executed';

-- =============================================================================
-- Table 2: risk_events - Risk violations and circuit breaker triggers
-- =============================================================================
CREATE TABLE IF NOT EXISTS risk_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('circuit_breaker', 'leverage_violation', 'exposure_limit', 'stop_loss_violation')),
  violation_type TEXT,
  symbol TEXT,
  violation_details JSONB NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for risk_events
CREATE INDEX idx_risk_events_type_created
  ON risk_events (event_type, created_at DESC);

CREATE INDEX idx_risk_events_severity
  ON risk_events (severity, created_at DESC);

CREATE INDEX idx_risk_events_symbol
  ON risk_events (symbol, created_at DESC)
  WHERE symbol IS NOT NULL;

COMMENT ON TABLE risk_events IS 'Risk violations and circuit breaker events';
COMMENT ON COLUMN risk_events.violation_details IS 'JSON with details like dailyPnL, dailyPnLPct, limit, etc.';

-- =============================================================================
-- Table 3: ace_logs - ACE framework compliance logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS ace_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KRW', 'KRX', 'US')),
  broker TEXT NOT NULL CHECK (broker IN ('KIS', 'UPBIT')),
  aspiration JSONB NOT NULL,
  capability JSONB NOT NULL,
  execution JSONB NOT NULL,
  outcome JSONB,
  trade_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for ace_logs
CREATE INDEX idx_ace_logs_symbol_created
  ON ace_logs (symbol, created_at DESC);

CREATE INDEX idx_ace_logs_trade_id
  ON ace_logs (trade_id)
  WHERE trade_id IS NOT NULL;

CREATE INDEX idx_ace_logs_market_broker
  ON ace_logs (market, broker, created_at DESC);

COMMENT ON TABLE ace_logs IS 'ACE (Aspiration-Capability-Execution-Outcome) compliance logs';
COMMENT ON COLUMN ace_logs.aspiration IS 'A: Goal - strategy, targetProfit, maxLoss, timeHorizon';
COMMENT ON COLUMN ace_logs.capability IS 'C: Readiness - signals, marketAnalysis, riskAssessment';
COMMENT ON COLUMN ace_logs.execution IS 'E: Actual trade - decision, actualEntry, actualStopLoss, size';
COMMENT ON COLUMN ace_logs.outcome IS 'O: Results - exitPrice, realizedPnL, pnLPct, duration, result';

-- =============================================================================
-- Table 4: market_breadth - Market-level indicators
-- =============================================================================
CREATE TABLE IF NOT EXISTS market_breadth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market TEXT NOT NULL CHECK (market IN ('KRX', 'US')),
  breadth_index DECIMAL NOT NULL CHECK (breadth_index >= 0 AND breadth_index <= 1),
  uptrend_ratio DECIMAL NOT NULL CHECK (uptrend_ratio >= 0 AND uptrend_ratio <= 1),
  advance_decline_line DECIMAL,
  mcclellan_oscillator DECIMAL,
  analysis_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (market, analysis_time)
);

-- Indexes for market_breadth
CREATE INDEX idx_market_breadth_market_time
  ON market_breadth (market, analysis_time DESC);

COMMENT ON TABLE market_breadth IS 'Market-level breadth indicators (S&P 500 breadth, KRX breadth, etc.)';
COMMENT ON COLUMN market_breadth.breadth_index IS 'Normalized breadth score 0-1 (% of stocks above MA50)';
COMMENT ON COLUMN market_breadth.uptrend_ratio IS 'Ratio of stocks in uptrend 0-1';

-- =============================================================================
-- Table 5: news_events - News impact tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS news_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source TEXT,
  impact_score DECIMAL NOT NULL CHECK (impact_score >= 1 AND impact_score <= 10),
  affected_symbols TEXT[],
  affected_sectors TEXT[],
  price_impact DECIMAL,
  spread_range DECIMAL,
  persistence_days INTEGER,
  event_time TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for news_events
CREATE INDEX idx_news_events_impact_time
  ON news_events (impact_score DESC, event_time DESC);

CREATE INDEX idx_news_events_symbols
  ON news_events USING GIN (affected_symbols);

CREATE INDEX idx_news_events_sectors
  ON news_events USING GIN (affected_sectors);

CREATE INDEX idx_news_events_time
  ON news_events (event_time DESC);

COMMENT ON TABLE news_events IS 'News events with impact scoring and affected symbols';
COMMENT ON COLUMN news_events.impact_score IS 'Impact score 1-10 (1=minimal, 10=extreme)';
COMMENT ON COLUMN news_events.spread_range IS 'How many symbols were affected';
COMMENT ON COLUMN news_events.persistence_days IS 'How many days the impact lasted';

-- =============================================================================
-- Migration Verification
-- =============================================================================

-- Verify all tables created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events');

  IF table_count = 5 THEN
    RAISE NOTICE 'SUCCESS: All 5 tables created successfully';
  ELSE
    RAISE EXCEPTION 'FAILED: Expected 5 tables, found %', table_count;
  END IF;
END $$;
