import { requireEnv, createLogger } from '@workspace/shared-utils';
import {
  EconomicEvent,
  EconomicEventsResponseSchema,
  CalendarEvent,
  CollectorResult,
} from '../types.js';

const logger = createLogger('economic-events-collector');
const FMP_API_KEY = requireEnv('FMP_API_KEY');
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * FMP API에서 경제 이벤트 가져오기
 */
export async function fetchEconomicEvents(params: {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}): Promise<EconomicEvent[]> {
  const { fromDate, toDate } = params;
  const url = `${FMP_BASE_URL}/economic_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;

  logger.info('경제 이벤트 조회 시작', { fromDate, toDate });

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FMP API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();

    // Zod 검증
    const validatedData = EconomicEventsResponseSchema.parse(rawData);

    logger.info('경제 이벤트 조회 완료', { count: validatedData.length });

    return validatedData;
  } catch (error) {
    logger.error('경제 이벤트 조회 실패', { error });
    throw error;
  }
}

/**
 * 경제 이벤트를 CalendarEvent 형식으로 변환
 */
export function transformEconomicEvent(event: EconomicEvent): CalendarEvent {
  // 제목 생성
  const title = `${event.event} (${event.country})`;

  // 요약 생성
  const summary = buildSummary(event);

  // 임팩트 점수 매핑 (High=8-10, Medium=5-7, Low=1-4)
  const impactScore = mapImpactToScore(event.impact || 'Low');

  // 영향받는 섹터 추론
  const affectedSectors = inferAffectedSectors(event);

  return {
    type: 'economic',
    title,
    summary,
    source: 'FMP Economic Calendar',
    impactScore,
    affectedSectors,
    priceImpactPct: null, // 경제 이벤트는 가격 영향을 정확히 예측하기 어려움
    publishedAt: event.date,
    metadata: {
      country: event.country,
      currency: event.currency,
      previous: event.previous,
      estimate: event.estimate,
      actual: event.actual,
      impact: event.impact,
    },
  };
}

/**
 * 이벤트 요약 생성
 */
function buildSummary(event: EconomicEvent): string {
  const parts: string[] = [];

  if (event.estimate !== null && event.estimate !== undefined) {
    parts.push(`예상: ${event.estimate}`);
  }

  if (event.previous !== null && event.previous !== undefined) {
    parts.push(`이전: ${event.previous}`);
  }

  if (event.actual !== null && event.actual !== undefined) {
    parts.push(`실제: ${event.actual}`);
  }

  if (parts.length === 0) {
    return `${event.event} 발표 예정`;
  }

  return parts.join(', ');
}

/**
 * FMP Impact 문자열을 1-10 점수로 변환
 */
function mapImpactToScore(impact: 'High' | 'Medium' | 'Low'): number {
  switch (impact) {
    case 'High':
      return 9; // 고임팩트 이벤트
    case 'Medium':
      return 6; // 중임팩트 이벤트
    case 'Low':
      return 3; // 저임팩트 이벤트
    default:
      return 5; // 기본값
  }
}

/**
 * 이벤트 이름 기반으로 영향받는 섹터 추론
 */
function inferAffectedSectors(event: EconomicEvent): string[] {
  const eventName = event.event.toLowerCase();
  const sectors: string[] = [];

  // FOMC, Fed Funds Rate → 전 섹터 영향
  if (eventName.includes('fomc') || eventName.includes('fed funds') || eventName.includes('interest rate decision')) {
    return ['Financials', 'Real Estate', 'Utilities', 'Technology', 'Consumer Discretionary'];
  }

  // CPI, Inflation → 소비재, 에너지
  if (eventName.includes('cpi') || eventName.includes('inflation') || eventName.includes('ppi')) {
    return ['Consumer Staples', 'Consumer Discretionary', 'Energy'];
  }

  // Employment, NFP, Jobless Claims → 소비재, 금융
  if (eventName.includes('employment') || eventName.includes('nfp') || eventName.includes('jobless') || eventName.includes('unemployment')) {
    return ['Consumer Discretionary', 'Financials', 'Industrials'];
  }

  // GDP → 전 섹터
  if (eventName.includes('gdp')) {
    return ['Financials', 'Technology', 'Industrials', 'Consumer Discretionary'];
  }

  // Retail Sales → 소비재
  if (eventName.includes('retail sales')) {
    return ['Consumer Discretionary', 'Consumer Staples'];
  }

  // Manufacturing, PMI → 산업재
  if (eventName.includes('manufacturing') || eventName.includes('pmi') || eventName.includes('industrial')) {
    return ['Industrials', 'Materials'];
  }

  // Housing → 부동산, 금융
  if (eventName.includes('housing') || eventName.includes('home sales')) {
    return ['Real Estate', 'Financials', 'Materials'];
  }

  // 기본값: 알 수 없음
  return [];
}

/**
 * 경제 이벤트 수집 및 변환
 */
export async function collectEconomicEvents(params: {
  fromDate: string;
  toDate: string;
}): Promise<CollectorResult> {
  const result: CollectorResult = {
    source: 'economic-events',
    eventsCount: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
  };

  try {
    const events = await fetchEconomicEvents(params);
    result.eventsCount = events.length;

    // 이벤트 변환은 별도 저장 함수에서 처리
    result.successCount = events.length;

    return result;
  } catch (error) {
    logger.error('경제 이벤트 수집 실패', { error });
    result.errorCount = 1;
    result.errors.push({
      event: 'fetchEconomicEvents',
      error: error instanceof Error ? error.message : String(error),
    });

    return result;
  }
}
