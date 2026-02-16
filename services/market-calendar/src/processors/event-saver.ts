import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import type { CalendarEvent } from '../types.js';

const logger = createLogger('event-saver');

/**
 * CalendarEvent를 news_events 테이블에 저장
 */
export async function saveCalendarEvent(event: CalendarEvent): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('news_events').insert({
    title: event.title,
    summary: event.summary,
    source: event.source,
    impact_score: event.impactScore,
    affected_sectors: event.affectedSectors,
    price_impact_pct: event.priceImpactPct,
    published_at: event.publishedAt,
    // metadata는 JSONB 컬럼에 저장 가능하다면 추가
  });

  if (error) {
    logger.error('이벤트 저장 실패', { event: event.title, error });
    throw new Error(`이벤트 저장 실패: ${error.message}`);
  }

  logger.debug('이벤트 저장 완료', { title: event.title });
}

/**
 * 여러 CalendarEvent를 배치로 저장
 */
export async function saveCalendarEvents(events: CalendarEvent[]): Promise<{
  successCount: number;
  errorCount: number;
  errors: Array<{ title: string; error: string }>;
}> {
  const result = {
    successCount: 0,
    errorCount: 0,
    errors: [] as Array<{ title: string; error: string }>,
  };

  for (const event of events) {
    try {
      await saveCalendarEvent(event);
      result.successCount++;
    } catch (error) {
      result.errorCount++;
      result.errors.push({
        title: event.title,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  logger.info('이벤트 배치 저장 완료', {
    total: events.length,
    success: result.successCount,
    error: result.errorCount,
  });

  return result;
}

/**
 * 특정 날짜 범위의 고임팩트 이벤트 조회
 */
export async function getHighImpactEvents(params: {
  fromDate: string;
  toDate: string;
  minImpactScore?: number;
}): Promise<CalendarEvent[]> {
  const { fromDate, toDate, minImpactScore = 8 } = params;
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
    throw new Error(`이벤트 조회 실패: ${error.message}`);
  }

  if (!data) {
    return [];
  }

  // DB 결과를 CalendarEvent 형식으로 변환
  return data.map((row) => ({
    id: row.id,
    type: row.source.includes('Earnings') ? ('earnings' as const) : ('economic' as const),
    title: row.title,
    summary: row.summary,
    source: row.source,
    impactScore: row.impact_score,
    affectedSectors: row.affected_sectors,
    priceImpactPct: row.price_impact_pct,
    publishedAt: row.published_at,
  }));
}

/**
 * 특정 심볼의 향후 실적 발표 조회
 */
export async function getUpcomingEarnings(symbol: string): Promise<CalendarEvent | null> {
  const supabase = getSupabase();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from('news_events')
    .select('*')
    .eq('source', 'FMP Earnings Calendar')
    .ilike('title', `${symbol}%`) // 제목에 심볼 포함
    .gte('published_at', now)
    .order('published_at', { ascending: true })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned
      return null;
    }
    logger.error('실적 발표 조회 실패', { symbol, error });
    throw new Error(`실적 발표 조회 실패: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    type: 'earnings',
    title: data.title,
    summary: data.summary,
    source: data.source,
    impactScore: data.impact_score,
    affectedSectors: data.affected_sectors,
    priceImpactPct: data.price_impact_pct,
    publishedAt: data.published_at,
  };
}
