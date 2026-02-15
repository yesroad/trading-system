-- ============================================================================
-- AI 예산 증가 함수 (upsert + increment)
-- ============================================================================

CREATE OR REPLACE FUNCTION increment_ai_budget(
  p_date TEXT,
  p_market TEXT,
  p_cost DECIMAL DEFAULT 0.0
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO ai_budget_tracking (date, market, call_count, estimated_cost_usd, updated_at)
  VALUES (p_date, p_market, 1, p_cost, NOW())
  ON CONFLICT (date, market)
  DO UPDATE SET
    call_count = ai_budget_tracking.call_count + 1,
    estimated_cost_usd = ai_budget_tracking.estimated_cost_usd + p_cost,
    updated_at = NOW();
END;
$$;

COMMENT ON FUNCTION increment_ai_budget IS 'AI 호출 횟수 및 비용 증가 (upsert)';
