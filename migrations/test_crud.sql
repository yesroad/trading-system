-- =============================================================================
-- Phase 1 CRUD Test - Run in Supabase SQL Editor
-- =============================================================================

-- 1. Test trading_signals
INSERT INTO trading_signals (
  symbol, market, broker, signal_type,
  entry_price, target_price, stop_loss, confidence,
  reason
) VALUES (
  'BTC', 'KRW', 'UPBIT', 'BUY',
  93000, 98000, 91500, 0.85,
  'Test signal - Phase 1 verification'
);

SELECT * FROM trading_signals WHERE symbol = 'BTC' ORDER BY created_at DESC LIMIT 1;

-- 2. Test risk_events
INSERT INTO risk_events (
  event_type, violation_type, symbol,
  violation_details, severity
) VALUES (
  'leverage_violation', 'max_leverage_exceeded', 'BTC',
  '{"requested": 2.0, "limit": 1.5, "action": "rejected"}'::jsonb,
  'medium'
);

SELECT * FROM risk_events ORDER BY created_at DESC LIMIT 1;

-- 3. Test ace_logs
INSERT INTO ace_logs (
  symbol, market, broker,
  aspiration, capability, execution
) VALUES (
  'BTC', 'KRW', 'UPBIT',
  '{"strategy": "Technical + AI", "targetProfit": "5%"}'::jsonb,
  '{"signals": [{"type": "technical", "confidence": 0.85}]}'::jsonb,
  '{"decision": "BUY", "actualEntry": 93000, "size": 0.1}'::jsonb
);

SELECT * FROM ace_logs WHERE symbol = 'BTC' ORDER BY created_at DESC LIMIT 1;

-- 4. Test market_breadth
INSERT INTO market_breadth (
  market, breadth_index, uptrend_ratio,
  advance_decline_line, analysis_time
) VALUES (
  'KRX', 0.72, 0.68, 1250, NOW()
);

SELECT * FROM market_breadth WHERE market = 'KRX' ORDER BY analysis_time DESC LIMIT 1;

-- 5. Test news_events
INSERT INTO news_events (
  title, source, impact_score,
  affected_symbols, affected_sectors, event_time
) VALUES (
  'Test: Federal Reserve rate decision',
  'Reuters', 8.5,
  ARRAY['SPY', 'QQQ', 'BTC'], ARRAY['Technology', 'Finance'],
  NOW()
);

SELECT * FROM news_events ORDER BY event_time DESC LIMIT 1;

-- =============================================================================
-- Verification Summary
-- =============================================================================

SELECT
  'trading_signals' as table_name,
  COUNT(*) as record_count
FROM trading_signals
UNION ALL
SELECT 'risk_events', COUNT(*) FROM risk_events
UNION ALL
SELECT 'ace_logs', COUNT(*) FROM ace_logs
UNION ALL
SELECT 'market_breadth', COUNT(*) FROM market_breadth
UNION ALL
SELECT 'news_events', COUNT(*) FROM news_events;

-- =============================================================================
-- Cleanup (optional)
-- =============================================================================

-- Uncomment to cleanup test data:
-- DELETE FROM trading_signals WHERE reason LIKE '%Phase 1 verification%';
-- DELETE FROM risk_events WHERE violation_type = 'max_leverage_exceeded';
-- DELETE FROM ace_logs WHERE symbol = 'BTC';
-- DELETE FROM market_breadth WHERE market = 'KRX';
-- DELETE FROM news_events WHERE title LIKE 'Test:%';
