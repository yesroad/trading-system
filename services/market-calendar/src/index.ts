import 'dotenv/config';
import { createLogger, nowIso } from '@workspace/shared-utils';
import { upsertWorkerStatus } from '@workspace/db-client';
import { DateTime } from 'luxon';
import {
  fetchEconomicEvents,
  transformEconomicEvent,
} from './collectors/economic-events.js';
import {
  fetchEarningsCalendar,
  transformEarningsEvent,
} from './collectors/earnings-calendar.js';
import { saveCalendarEvents } from './processors/event-saver.js';
import type { CalendarEvent } from './types.js';

const logger = createLogger('market-calendar');
const WORKER_ID = 'market-calendar';
const LOOP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24시간 (하루 1회 실행)
const LOOKAHEAD_DAYS = 7; // 향후 7일간의 이벤트 수집

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

  try {
    // 1. 경제 이벤트 수집
    logger.info('경제 이벤트 수집 시작');
    const economicEvents = await fetchEconomicEvents({ fromDate, toDate });
    const transformedEconomicEvents = economicEvents.map(transformEconomicEvent);
    totalEvents += transformedEconomicEvents.length;

    logger.info('경제 이벤트 수집 완료', { count: transformedEconomicEvents.length });

    // 2. 실적 발표 일정 수집
    logger.info('실적 발표 일정 수집 시작');
    const earningsEvents = await fetchEarningsCalendar({ fromDate, toDate });
    const transformedEarningsEvents = earningsEvents.map(transformEarningsEvent);
    totalEvents += transformedEarningsEvents.length;

    logger.info('실적 발표 일정 수집 완료', { count: transformedEarningsEvents.length });

    // 3. 모든 이벤트 저장
    const allEvents: CalendarEvent[] = [
      ...transformedEconomicEvents,
      ...transformedEarningsEvents,
    ];

    logger.info('이벤트 저장 시작', { totalCount: allEvents.length });
    const saveResult = await saveCalendarEvents(allEvents);

    successCount = saveResult.successCount;
    errorCount = saveResult.errorCount;

    logger.info('이벤트 저장 완료', {
      total: allEvents.length,
      success: saveResult.successCount,
      error: saveResult.errorCount,
    });

    // 워커 상태 업데이트
    await upsertWorkerStatus({
      service: WORKER_ID,
      last_event_at: nowIso(),
      state: errorCount > 0 ? 'failed' : 'success',
      message: errorCount > 0 ? `${errorCount}개 이벤트 저장 실패` : null,
    });

    logger.info('수집 배치 완료', {
      totalEvents,
      successCount,
      errorCount,
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
