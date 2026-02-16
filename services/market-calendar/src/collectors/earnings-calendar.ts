import { requireEnv, createLogger } from '@workspace/shared-utils';
import {
  EarningsEvent,
  EarningsEventsResponseSchema,
  CalendarEvent,
  CollectorResult,
} from '../types.js';

const logger = createLogger('earnings-calendar-collector');
const FMP_API_KEY = requireEnv('FMP_API_KEY');
const FMP_BASE_URL = 'https://financialmodelingprep.com/api/v3';

/**
 * FMP API에서 실적 발표 일정 가져오기
 */
export async function fetchEarningsCalendar(params: {
  fromDate: string; // YYYY-MM-DD
  toDate: string; // YYYY-MM-DD
}): Promise<EarningsEvent[]> {
  const { fromDate, toDate } = params;
  const url = `${FMP_BASE_URL}/earning_calendar?from=${fromDate}&to=${toDate}&apikey=${FMP_API_KEY}`;

  logger.info('실적 발표 일정 조회 시작', { fromDate, toDate });

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`FMP API 요청 실패: ${response.status} ${response.statusText}`);
    }

    const rawData = await response.json();

    // Zod 검증
    const validatedData = EarningsEventsResponseSchema.parse(rawData);

    logger.info('실적 발표 일정 조회 완료', { count: validatedData.length });

    return validatedData;
  } catch (error) {
    logger.error('실적 발표 일정 조회 실패', { error });
    throw error;
  }
}

/**
 * 실적 발표 이벤트를 CalendarEvent 형식으로 변환
 */
export function transformEarningsEvent(event: EarningsEvent): CalendarEvent {
  // 제목 생성
  const timingLabel = getTimingLabel(event.time);
  const title = `${event.symbol} 실적 발표 (${timingLabel})`;

  // 요약 생성
  const summary = buildSummary(event);

  // 임팩트 점수 계산 (EPS 서프라이즈 기반)
  const impactScore = calculateEarningsImpact(event);

  // 발표 시각 생성 (BMO: 08:00, AMC: 16:00, TBC: 09:30)
  const publishedAt = buildPublishedAt(event.date, event.time);

  return {
    type: 'earnings',
    title,
    summary,
    source: 'FMP Earnings Calendar',
    impactScore,
    affectedSectors: null, // 개별 종목이므로 섹터는 별도 조회 필요
    priceImpactPct: null, // 실적 발표 후 측정 가능
    publishedAt,
    metadata: {
      symbol: event.symbol,
      eps: event.eps,
      epsEstimated: event.epsEstimated,
      revenue: event.revenue,
      revenueEstimated: event.revenueEstimated,
      time: event.time,
    },
  };
}

/**
 * 발표 시간 라벨 생성
 */
function getTimingLabel(time?: 'bmo' | 'amc' | 'tbc'): string {
  switch (time) {
    case 'bmo':
      return 'BMO'; // Before Market Open
    case 'amc':
      return 'AMC'; // After Market Close
    case 'tbc':
    default:
      return 'TAS'; // Time Not Announced
  }
}

/**
 * 이벤트 요약 생성
 */
function buildSummary(event: EarningsEvent): string {
  const parts: string[] = [];

  if (event.epsEstimated !== null && event.epsEstimated !== undefined) {
    parts.push(`EPS 예상: $${event.epsEstimated.toFixed(2)}`);
  }

  if (event.revenueEstimated !== null && event.revenueEstimated !== undefined) {
    const revenueInM = (event.revenueEstimated / 1_000_000).toFixed(0);
    parts.push(`매출 예상: $${revenueInM}M`);
  }

  if (parts.length === 0) {
    return `${event.symbol} 실적 발표 예정`;
  }

  return parts.join(', ');
}

/**
 * 실적 발표 임팩트 점수 계산
 *
 * - EPS 서프라이즈가 클수록 높은 점수
 * - 실제 EPS가 없으면 기본 점수 5
 */
function calculateEarningsImpact(event: EarningsEvent): number {
  const { eps, epsEstimated } = event;

  // 실제 EPS가 없으면 기본 점수
  if (eps === null || eps === undefined) {
    return 5;
  }

  // 예상 EPS가 없으면 기본 점수
  if (epsEstimated === null || epsEstimated === undefined) {
    return 5;
  }

  // EPS 서프라이즈 계산 (%)
  const surprise = ((eps - epsEstimated) / Math.abs(epsEstimated)) * 100;

  // 서프라이즈 크기에 따라 점수 부여
  if (Math.abs(surprise) >= 20) {
    return 9; // 매우 큰 서프라이즈
  } else if (Math.abs(surprise) >= 10) {
    return 7; // 큰 서프라이즈
  } else if (Math.abs(surprise) >= 5) {
    return 6; // 중간 서프라이즈
  } else {
    return 5; // 작은 서프라이즈
  }
}

/**
 * 발표 시각 생성 (ISO timestamp)
 */
function buildPublishedAt(date: string, time?: 'bmo' | 'amc' | 'tbc'): string {
  // date는 YYYY-MM-DD 형식
  // BMO: 08:00 ET, AMC: 16:00 ET, TBC: 09:30 ET

  const hour = time === 'bmo' ? '08:00:00' : time === 'amc' ? '16:00:00' : '09:30:00';

  // ET (Eastern Time)를 UTC로 변환 (간단하게 -5시간, 서머타임 무시)
  // 실제로는 Luxon으로 정확한 변환 필요
  return `${date}T${hour}Z`;
}

/**
 * 실적 발표 일정 수집 및 변환
 */
export async function collectEarningsCalendar(params: {
  fromDate: string;
  toDate: string;
}): Promise<CollectorResult> {
  const result: CollectorResult = {
    source: 'earnings-calendar',
    eventsCount: 0,
    successCount: 0,
    errorCount: 0,
    errors: [],
  };

  try {
    const events = await fetchEarningsCalendar(params);
    result.eventsCount = events.length;

    // 이벤트 변환은 별도 저장 함수에서 처리
    result.successCount = events.length;

    return result;
  } catch (error) {
    logger.error('실적 발표 일정 수집 실패', { error });
    result.errorCount = 1;
    result.errors.push({
      event: 'fetchEarningsCalendar',
      error: error instanceof Error ? error.message : String(error),
    });

    return result;
  }
}
