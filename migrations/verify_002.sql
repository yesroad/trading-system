-- =============================================================================
-- Migration Verification: 002_trading_skills
-- =============================================================================

-- 1. 테이블 존재 확인
SELECT
  table_name,
  CASE
    WHEN table_name IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events')
    THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events')
ORDER BY table_name;

-- 2. 인덱스 확인
SELECT
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events')
ORDER BY tablename, indexname;

-- 3. 제약조건 확인
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name;

-- 4. 컬럼 확인 (trading_signals)
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'trading_signals'
ORDER BY ordinal_position;

-- 5. 테이블 코멘트 확인
SELECT
  c.relname as table_name,
  obj_description(c.oid) as table_comment
FROM pg_class c
WHERE c.relname IN ('trading_signals', 'risk_events', 'ace_logs', 'market_breadth', 'news_events')
  AND c.relkind = 'r'
ORDER BY c.relname;
