-- ============================================================================
-- AI 모니터링 및 비용 추적 테이블
-- ============================================================================

-- AI 예산 추적 (일별)
CREATE TABLE IF NOT EXISTS ai_budget_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT NOT NULL,  -- 'YYYY-MM-DD'
  market TEXT NOT NULL CHECK (market IN ('CRYPTO', 'KRX', 'US')),
  call_count INT NOT NULL DEFAULT 0,
  estimated_cost_usd DECIMAL(10, 4) DEFAULT 0.0000,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, market)
);

CREATE INDEX IF NOT EXISTS idx_ai_budget_tracking_date ON ai_budget_tracking (date DESC);
CREATE INDEX IF NOT EXISTS idx_ai_budget_tracking_market ON ai_budget_tracking (market, date DESC);

COMMENT ON TABLE ai_budget_tracking IS 'AI 호출 횟수 및 비용 추적 (일별)';
COMMENT ON COLUMN ai_budget_tracking.call_count IS 'AI 호출 횟수 (누적)';
COMMENT ON COLUMN ai_budget_tracking.estimated_cost_usd IS '예상 비용 (USD)';

-- ============================================================================

-- 신호 생성 실패 추적
CREATE TABLE IF NOT EXISTS signal_generation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_analysis_id TEXT,  -- ai_analysis_results.id 참조
  symbol TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('CRYPTO', 'KRX', 'US')),
  failure_reason TEXT NOT NULL,
  failure_type TEXT CHECK (failure_type IN (
    'insufficient_technical_data',  -- 기술적 지표 부족
    'validation_failed',             -- 신호 검증 실패
    'atr_missing',                   -- ATR 없음
    'error'                          -- 예외 발생
  )),
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_failures_created_at ON signal_generation_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_failures_symbol ON signal_generation_failures (symbol, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signal_failures_type ON signal_generation_failures (failure_type);

COMMENT ON TABLE signal_generation_failures IS '신호 생성 실패 추적';
COMMENT ON COLUMN signal_generation_failures.failure_reason IS '실패 사유 (사람이 읽을 수 있는 형태)';
COMMENT ON COLUMN signal_generation_failures.failure_type IS '실패 유형 (분류)';

-- ============================================================================
-- 뷰: 최근 7일 AI 비용 요약
-- ============================================================================

CREATE OR REPLACE VIEW ai_cost_summary_7d AS
SELECT
  market,
  SUM(call_count) AS total_calls,
  SUM(estimated_cost_usd) AS total_cost_usd,
  AVG(call_count) AS avg_calls_per_day,
  COUNT(*) AS days
FROM ai_budget_tracking
WHERE date >= (CURRENT_DATE - INTERVAL '7 days')::TEXT
GROUP BY market;

COMMENT ON VIEW ai_cost_summary_7d IS '최근 7일 AI 비용 요약';

-- ============================================================================
-- 뷰: 신호 생성 실패율 (최근 24시간)
-- ============================================================================

CREATE OR REPLACE VIEW signal_failure_rate_24h AS
SELECT
  market,
  COUNT(*) AS failure_count,
  COUNT(*) FILTER (WHERE failure_type = 'validation_failed') AS validation_failures,
  COUNT(*) FILTER (WHERE failure_type = 'insufficient_technical_data') AS data_insufficient_failures,
  COUNT(*) FILTER (WHERE failure_type = 'atr_missing') AS atr_missing_failures,
  COUNT(*) FILTER (WHERE failure_type = 'error') AS error_failures
FROM signal_generation_failures
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY market;

COMMENT ON VIEW signal_failure_rate_24h IS '신호 생성 실패 통계 (최근 24시간)';
