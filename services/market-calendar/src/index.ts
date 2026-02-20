import '@workspace/shared-utils/env-loader';
import { createLogger, envBoolean, nowIso } from '@workspace/shared-utils';
import { upsertWorkerStatus } from '@workspace/db-client';
import { DateTime } from 'luxon';
import { fetchEconomicEvents, transformEconomicEvent } from './collectors/economic-events.js';
import { fetchEarningsCalendar, transformEarningsEvent } from './collectors/earnings-calendar.js';
import { saveCalendarEvents } from './processors/event-saver.js';
import type { CalendarEvent } from './types.js';

const logger = createLogger('market-calendar');
const WORKER_ID = 'market-calendar';
const LOOP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간 (하루 1회 실행)
const LOOKAHEAD_DAYS = 7; // 향후 7일간의 이벤트 수집
const ENABLE_ECONOMIC_EVENTS = envBoolean('MARKET_CALENDAR_ENABLE_ECONOMIC_EVENTS', false);

/**
 * 메인 수집 루프
 */
async function mainLoop(): Promise<void> {
  logger.info('Market Calendar 수집 시작');

  // 날짜 범위 계산
  const now = DateTime.now();
  const fromDate = now.toISODate(); // YYYY-MM-DD
  const toDate = now.plus({ days: LOOKAHEAD_DAYS }).toISODate();

  if (!fromDate || !toDate) {
    logger.error('날짜 계산 실패');
    return;
  }

  logger.info('수집 날짜 범위', { fromDate, toDate });

  let totalEvents = 0;
  let successCount = 0;
  let errorCount = 0;
  const collectorErrors: string[] = [];

  try {
    const allEvents: CalendarEvent[] = [];

    // 1. 경제 이벤트 수집 (기본 비활성)
    if (ENABLE_ECONOMIC_EVENTS) {
      logger.info('경제 이벤트 수집 시작');
      try {
        const economicEvents = await fetchEconomicEvents({ fromDate, toDate });
        const transformedEconomicEvents = economicEvents.map(transformEconomicEvent);
        totalEvents += transformedEconomicEvents.length;
        allEvents.push(...transformedEconomicEvents);

        logger.info('경제 이벤트 수집 완료', { count: transformedEconomicEvents.length });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        collectorErrors.push(`economic: ${message}`);
        logger.warn('경제 이벤트 수집 실패(계속 진행)', { message });
      }
    } else {
      logger.info('경제 이벤트 수집 비활성화', {
        env: 'MARKET_CALENDAR_ENABLE_ECONOMIC_EVENTS',
      });
    }

    // 2. 실적 발표 일정 수집
    logger.info('실적 발표 일정 수집 시작');
    try {
      const earningsEvents = await fetchEarningsCalendar({ fromDate, toDate });
      const transformedEarningsEvents = earningsEvents.map(transformEarningsEvent);
      totalEvents += transformedEarningsEvents.length;
      allEvents.push(...transformedEarningsEvents);

      logger.info('실적 발표 일정 수집 완료', { count: transformedEarningsEvents.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      collectorErrors.push(`earnings: ${message}`);
      logger.warn('실적 발표 일정 수집 실패(계속 진행)', { message });
    }

    // 둘 다 실패하면 저장 없이 실패 처리
    if (allEvents.length === 0 && collectorErrors.length > 0) {
      const message = collectorErrors.join(' | ');
      await upsertWorkerStatus({
        service: WORKER_ID,
        last_event_at: nowIso(),
        state: 'failed',
        message,
      });
      logger.error('수집 배치 실패: 유효 이벤트 없음', { message });
      return;
    }

    // 3. 이벤트 저장

    logger.info('이벤트 저장 시작', { totalCount: allEvents.length });
    const saveResult = await saveCalendarEvents(allEvents);

    successCount = saveResult.successCount;
    errorCount = saveResult.errorCount;

    logger.info('이벤트 저장 완료', {
      total: allEvents.length,
      success: saveResult.successCount,
      error: saveResult.errorCount,
      collectorErrors: collectorErrors.length,
    });

    const hasCollectorErrors = collectorErrors.length > 0;
    const hasSaveErrors = errorCount > 0;
    const status = hasSaveErrors && successCount === 0 ? 'failed' : 'success';
    const messageParts: string[] = [];
    if (hasSaveErrors) messageParts.push(`${errorCount}개 이벤트 저장 실패`);
    if (hasCollectorErrors) messageParts.push(`collector 오류: ${collectorErrors.join(' | ')}`);

    // 워커 상태 업데이트
    await upsertWorkerStatus({
      service: WORKER_ID,
      last_event_at: nowIso(),
      state: status,
      message: messageParts.length > 0 ? messageParts.join(' / ') : null,
    });

    logger.info('수집 배치 완료', {
      totalEvents,
      successCount,
      errorCount,
      collectorErrors,
    });
  } catch (error) {
    logger.error('수집 배치 실패', { error });

    // 워커 상태 업데이트
    await upsertWorkerStatus({
      service: WORKER_ID,
      last_event_at: nowIso(),
      state: 'failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * 스케줄러 루프
 */
async function scheduler(): Promise<void> {
  logger.info('Market Calendar 스케줄러 시작', {
    interval: `${LOOP_INTERVAL_MS / 1000 / 60 / 60}시간`,
  });

  // 첫 실행
  await mainLoop();

  // 이후 24시간마다 실행
  setInterval(async () => {
    try {
      await mainLoop();
    } catch (error) {
      logger.error('스케줄러 루프 에러', { error });
    }
  }, LOOP_INTERVAL_MS);
}

// 프로세스 시작
scheduler().catch((error) => {
  logger.error('Market Calendar 시작 실패', { error });
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM 수신, 종료 중...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT 수신, 종료 중...');
  process.exit(0);
});
