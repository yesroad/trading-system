-- Migration: Fix news_events table
-- Created: 2026-02-16
-- Purpose: 기존 테이블 삭제 후 재생성

-- 1. 기존 테이블 삭제 (있다면)
DROP TABLE IF EXISTS news_events CASCADE;

-- 2. 테이블 생성
CREATE TABLE news_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  impact_score INTEGER CHECK (impact_score >= 1 AND impact_score <= 10),
  affected_sectors TEXT[],
  price_impact_pct DECIMAL,
  published_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. 인덱스 생성
CREATE INDEX idx_news_events_published_at
  ON news_events (published_at DESC);

CREATE INDEX idx_news_events_impact_score
  ON news_events (impact_score DESC);

CREATE INDEX idx_news_events_source
  ON news_events (source);

CREATE INDEX idx_news_events_created_at
  ON news_events (created_at DESC);

-- 4. 코멘트 추가
COMMENT ON TABLE news_events IS '경제 이벤트 및 실적 발표 일정';
COMMENT ON COLUMN news_events.title IS '이벤트 제목 (예: FOMC 금리 결정, AAPL 실적 발표)';
COMMENT ON COLUMN news_events.summary IS '이벤트 요약 (예상치, 이전값 등)';
COMMENT ON COLUMN news_events.source IS '데이터 소스 (FMP Economic Calendar, FMP Earnings Calendar)';
COMMENT ON COLUMN news_events.impact_score IS '임팩트 점수 (1-10, 10이 가장 높음)';
COMMENT ON COLUMN news_events.affected_sectors IS '영향받는 섹터 목록';
COMMENT ON COLUMN news_events.price_impact_pct IS '가격 영향 % (실제 발표 후 측정)';
COMMENT ON COLUMN news_events.published_at IS '이벤트 발표 시각';
COMMENT ON COLUMN news_events.created_at IS 'DB 생성 시각';
