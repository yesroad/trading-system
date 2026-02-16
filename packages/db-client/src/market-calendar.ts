import { getSupabase } from './client.js';
import { createLogger } from '@workspace/shared-utils';
import { DateTime } from 'luxon';

const logger = createLogger('db-client:market-calendar');

export type CalendarEvent = {
  id?: string;
  type: 'economic' | 'earnings';
  title: string;
  summary: string;
  source: string;
  impactScore: number;
  affectedSectors: string[] | null;
  priceImpactPct: number | null;
  publishedAt: string;
};

export type MarketContext = {
  upcomingEvents: CalendarEvent[];
  hasHighImpactEventToday: boolean;
  hasHighImpactEventTomorrow: boolean;
  eventSummary: string;
};

export type EventRiskResult = {
  hasRisk: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  reason: string;
  event: {
    title: string;
    publishedAt: string;
    impactScore: number;
  } | null;
};

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
    .maybeSingle();

  if (error) {
    if (error.code === 'PGRST116') {
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
export async function buildMarketContext(): Promise<MarketContext> {
  const upcomingEvents = await getUpcomingHighImpactEvents({ days: 7, minImpactScore: 8 });

  const now = DateTime.now();
  const todayEnd = now.endOf('day').toISO();
  const tomorrowEnd = now.plus({ days: 1 }).endOf('day').toISO();

  const hasHighImpactEventToday = upcomingEvents.some((e) => e.publishedAt <= (todayEnd || ''));
  const hasHighImpactEventTomorrow = upcomingEvents.some(
    (e) => e.publishedAt <= (tomorrowEnd || '') && e.publishedAt > (todayEnd || '')
  );

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

/**
 * 거래 전 이벤트 리스크 체크
 *
 * @param symbol - 종목 심볼
 * @returns 이벤트 리스크 결과
 */
export async function checkEventRisk(symbol: string): Promise<EventRiskResult> {
  logger.debug('이벤트 리스크 체크 시작', { symbol });

  const earningsEvent = await checkUpcomingEarnings(symbol);

  if (!earningsEvent) {
    logger.debug('향후 24시간 이내 실적 발표 없음', { symbol });
    return {
      hasRisk: false,
      riskLevel: 'low',
      reason: '향후 24시간 이내 주요 이벤트 없음',
      event: null,
    };
  }

  const impactScore = earningsEvent.impactScore;

  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (impactScore >= 8) {
    riskLevel = 'high';
  } else if (impactScore >= 5) {
    riskLevel = 'medium';
  }

  const reason = `24시간 이내 실적 발표 예정 (${earningsEvent.publishedAt}, 임팩트: ${impactScore}/10)`;

  logger.warn('이벤트 리스크 감지', {
    symbol,
    riskLevel,
    impactScore,
    publishedAt: earningsEvent.publishedAt,
  });

  return {
    hasRisk: true,
    riskLevel,
    reason,
    event: {
      title: earningsEvent.title,
      publishedAt: earningsEvent.publishedAt,
      impactScore: earningsEvent.impactScore,
    },
  };
}

/**
 * 리스크 레벨에 따른 거래 권장사항
 *
 * @param riskLevel - 리스크 레벨
 * @returns 권장사항
 */
export function getRecommendation(
  riskLevel: 'low' | 'medium' | 'high'
): 'proceed' | 'reduce_size' | 'block' {
  switch (riskLevel) {
    case 'low':
      return 'proceed';
    case 'medium':
      return 'reduce_size';
    case 'high':
      return 'block';
    default:
      return 'proceed';
  }
}
