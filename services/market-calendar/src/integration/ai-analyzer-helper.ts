import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import type { CalendarEvent } from '../types.js';

const logger = createLogger('ai-analyzer-helper');

/**
 * AI Analyzer가 사용할 수 있는 헬퍼 함수들
 *
 * 이 함수들은 AI Analyzer의 market context 구성에 활용됨
 */

/**
 * 향후 N일 이내의 고임팩트 이벤트 조회
 *
 * @param days - 조회할 일수 (기본: 7일)
 * @param minImpactScore - 최소 임팩트 점수 (기본: 8)
 * @returns 고임팩트 이벤트 목록
 */
export async function getUpcomingHighImpactEvents(params?: {
  days?: number;
  minImpactScore?: number;
}): Promise<CalendarEvent[]> {
  const { days = 7, minImpactScore = 8 } = params || {};

  const now = DateTime.now();
  const fromDate = now.toISO();
  const toDate = now.plus({ days }).toISO();

  if (!fromDate || !toDate) {
    logger.error('날짜 생성 실패');
    return [];
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .gte('published_at', fromDate)
    .lte('published_at', toDate)
    .gte('impact_score', minImpactScore)
    .order('published_at', { ascending: true });

  if (error) {
    logger.error('고임팩트 이벤트 조회 실패', { error });
    return [];
  }

  if (!data || data.length === 0) {
    logger.info('향후 고임팩트 이벤트 없음', { days, minImpactScore });
    return [];
  }

  logger.info('고임팩트 이벤트 조회 완료', { count: data.length });

  // DB 결과를 CalendarEvent 형식으로 변환
  return data.map((row) => ({
    id: row.id,
    type: row.source.includes('Earnings') ? ('earnings' as const) : ('economic' as const),
    title: row.title,
    summary: row.summary || '',
    source: row.source,
    impactScore: row.impact_score,
    affectedSectors: row.affected_sectors,
    priceImpactPct: row.price_impact_pct,
    publishedAt: row.published_at,
  }));
}

/**
 * 특정 심볼의 향후 24시간 이내 실적 발표 체크
 *
 * @param symbol - 종목 심볼
 * @returns 실적 발표 이벤트 또는 null
 */
export async function checkUpcomingEarnings(symbol: string): Promise<CalendarEvent | null> {
  const now = DateTime.now();
  const fromDate = now.toISO();
  const toDate = now.plus({ hours: 24 }).toISO();

  if (!fromDate || !toDate) {
    logger.error('날짜 생성 실패');
    return null;
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .eq('source', 'FMP Earnings Calendar')
    .ilike('title', `${symbol}%`)
    .gte('published_at', fromDate)
    .lte('published_at', toDate)
    .order('published_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    logger.error('실적 발표 조회 실패', { symbol, error });
    return null;
  }

  if (!data) {
    return null;
  }

  logger.info('실적 발표 발견', { symbol, date: data.published_at });

  return {
    id: data.id,
    type: 'earnings',
    title: data.title,
    summary: data.summary || '',
    source: data.source,
    impactScore: data.impact_score,
    affectedSectors: data.affected_sectors,
    priceImpactPct: data.price_impact_pct,
    publishedAt: data.published_at,
  };
}

/**
 * 마켓 컨텍스트 생성 (AI Analyzer용)
 *
 * @returns AI Analyzer가 사용할 수 있는 마켓 컨텍스트 객체
 */
export async function buildMarketContext(): Promise<{
  upcomingEvents: CalendarEvent[];
  hasHighImpactEventToday: boolean;
  hasHighImpactEventTomorrow: boolean;
  eventSummary: string;
}> {
  // 향후 7일간의 고임팩트 이벤트 조회
  const upcomingEvents = await getUpcomingHighImpactEvents({ days: 7, minImpactScore: 8 });

  // 오늘/내일 고임팩트 이벤트 체크
  const now = DateTime.now();
  const todayEnd = now.endOf('day').toISO();
  const tomorrowEnd = now.plus({ days: 1 }).endOf('day').toISO();

  const hasHighImpactEventToday = upcomingEvents.some((e) => e.publishedAt <= (todayEnd || ''));
  const hasHighImpactEventTomorrow = upcomingEvents.some(
    (e) => e.publishedAt <= (tomorrowEnd || '') && e.publishedAt > (todayEnd || ''),
  );

  // 이벤트 요약 생성
  let eventSummary = '';
  if (upcomingEvents.length === 0) {
    eventSummary = '향후 7일 이내 고임팩트 이벤트 없음';
  } else {
    const titles = upcomingEvents.slice(0, 3).map((e) => e.title);
    eventSummary = `향후 고임팩트 이벤트 ${upcomingEvents.length}개: ${titles.join(', ')}`;
  }

  return {
    upcomingEvents,
    hasHighImpactEventToday,
    hasHighImpactEventTomorrow,
    eventSummary,
  };
}
