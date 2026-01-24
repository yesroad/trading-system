/**
 * yfinance(=Yahoo Chart API) 배치 수집 워커
 * - 기본: 15분 주기
 * - 실패 시: 지수 백오프(최대 15분)
 * - 실행 조건(옵션):
 *   - MARKET_ONLY: 미국 정규장(09:30~16:00 ET) + 휴일/주말 스킵
 *   - EXTENDED: 프리/애프터 포함(04:00~20:00 ET) + 휴일/주말 스킵
 *   - ALWAYS: 24시간 실행(휴일도 실행)
 */

import { DateTime } from 'luxon';
import { supabase } from './supabase';
import { fetchYahooBars } from './fetchYahoo';
import { upsertBars } from './db';
import type { Nullable } from './types/utils';

const SYMBOLS = ['AAPL', 'TSLA'];
const TIMEFRAME = '1m';

// 정상 주기(성공 시)
const BASE_LOOP_MS = 15 * 60 * 1000;

// 실패 백오프(최소 30초 ~ 최대 BASE_LOOP_MS)
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = BASE_LOOP_MS;

type RunMode = 'MARKET_ONLY' | 'EXTENDED' | 'ALWAYS';

function env(name: string) {
  const v = process.env[name];
  return v ?? '';
}
const YF_RUN_MODE = env('YF_RUN_MODE');

const RUN_MODE = (YF_RUN_MODE || 'MARKET_ONLY') as RunMode;

const SERVICE_NAME = 'yf-collector' as const;

type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

async function safeUpsertWorkerStatus(params: {
  state: WorkerState;
  message?: Nullable<string>;
  last_event_at?: string;
  last_success_at?: Nullable<string>;
}) {
  try {
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from('worker_status').upsert(
      {
        service: SERVICE_NAME,
        run_mode: RUN_MODE,
        state: params.state,
        message: params.message ?? null,
        last_event_at: params.last_event_at ?? nowIso,
        last_success_at: params.last_success_at ?? null,
        updated_at: nowIso,
      },
      { onConflict: 'service' },
    );

    if (error) {
      console.error('[yf-collector] worker_status 업데이트 실패', error);
    }
  } catch (e) {
    console.error('[yf-collector] worker_status 업데이트 예외', e);
  }
}

function nowNy() {
  return DateTime.now().setZone('America/New_York');
}

function isWeekend(dt: DateTime) {
  // 6=Saturday, 7=Sunday
  return dt.weekday >= 6;
}

async function isUsMarketClosed(dateIso: string) {
  const { data, error } = await supabase
    .from('market_calendar')
    .select('status, reason')
    .eq('market', 'US')
    .eq('venue', 'NYSE')
    .eq('date', dateIso)
    .maybeSingle();

  if (error) {
    console.error('[yf-collector] market_calendar 조회 실패', error);
    // 조회 실패 시에는 수집을 멈추지 않음
    return { closed: false, reason: '' };
  }

  if (!data) return { closed: false, reason: '' };
  return { closed: data.status === 'closed', reason: data.reason ?? '' };
}

function minutesOfDay(dt: DateTime) {
  return dt.hour * 60 + dt.minute;
}

function isInMarketHours(dt: DateTime) {
  const m = minutesOfDay(dt);
  // 09:30(570) ~ 16:00(960)
  return m >= 570 && m <= 960;
}

function isInExtendedHours(dt: DateTime) {
  const m = minutesOfDay(dt);
  // 04:00(240) ~ 20:00(1200)
  return m >= 240 && m <= 1200;
}

/**
 * 이번 실행을 스킵할지 판단
 * - 스킵은 실패가 아니라 정상 처리
 */
async function shouldSkipNow() {
  const dt = nowNy();

  if (RUN_MODE === 'ALWAYS') {
    return { skip: false as const, reason: '' };
  }

  if (isWeekend(dt)) {
    return { skip: true as const, reason: '주말' };
  }

  const d = dt.toISODate();
  if (d) {
    const h = await isUsMarketClosed(d);
    if (h.closed) {
      return {
        skip: true as const,
        reason: `미국장 휴일${h.reason ? ` (${h.reason})` : ''}`,
      };
    }
  }

  if (RUN_MODE === 'EXTENDED') {
    if (!isInExtendedHours(dt)) return { skip: true as const, reason: '장외(확장시간 아님)' };
    return { skip: false as const, reason: '' };
  }

  // MARKET_ONLY
  if (!isInMarketHours(dt)) return { skip: true as const, reason: '장외(정규장 아님)' };
  return { skip: false as const, reason: '' };
}

console.log('[yf-collector] 해외주식 배치 수집 시작');
console.log('[yf-collector] 실행 모드:', RUN_MODE);

await safeUpsertWorkerStatus({ state: 'unknown', message: '시작됨' });

// 프로세스 내부 중복 실행 방지
let isRunning = false;
// 스킵 상태(사유) 캐시: 같은 사유로 계속 스킵될 때 로그/DB 업데이트를 반복하지 않음
let lastSkipReason: Nullable<string> = null;

// 백오프 상태
let backoffMs = BACKOFF_MIN_MS;

function nextDelayMs(success: boolean) {
  if (success) {
    backoffMs = BACKOFF_MIN_MS;
    return BASE_LOOP_MS;
  }
  backoffMs = Math.min(BACKOFF_MAX_MS, backoffMs * 2);
  return backoffMs;
}

async function runOnce(): Promise<{ ok: boolean; skipped: boolean }> {
  if (isRunning) {
    console.warn('[yf-collector] 이전 실행이 아직 끝나지 않아 이번 실행은 건너뜀');
    return { ok: true, skipped: true };
  }

  const { skip, reason } = await shouldSkipNow();
  if (skip) {
    // 같은 사유로 반복 스킵이면 조용히(로그/DB 업데이트 최소화)
    if (lastSkipReason !== reason) {
      lastSkipReason = reason;
      console.log('[yf-collector] 실행 스킵:', reason);

      await safeUpsertWorkerStatus({
        state: 'skipped',
        message: reason,
        last_event_at: new Date().toISOString(),
      });
    }

    return { ok: true, skipped: true }; // 실패 아님
  }

  // 스킵 상태에서 정상 실행으로 돌아오는 순간(1회)
  if (lastSkipReason !== null) {
    console.log('[yf-collector] 수집 재개');
    lastSkipReason = null;
  }

  isRunning = true;

  await safeUpsertWorkerStatus({
    state: 'running',
    message: '수집 중',
    last_event_at: new Date().toISOString(),
  });

  const startedAt = new Date().toISOString();

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({
      job: 'yfinance-equity',
      symbols: SYMBOLS,
      timeframe: TIMEFRAME,
      started_at: startedAt,
      status: 'running',
    })
    .select()
    .single();

  if (runError || !run) {
    console.error('[yf-collector] ingestion_runs 시작 기록 실패', runError);
    isRunning = false;
    return { ok: false, skipped: false };
  }

  try {
    let insertedTotal = 0;

    for (const symbol of SYMBOLS) {
      const bars = await fetchYahooBars(symbol);
      const { inserted } = await upsertBars(symbol, TIMEFRAME, bars);
      insertedTotal += inserted;

      console.log('[yf-collector] 수집 완료:', symbol, `(${bars.length} bars)`);
    }

    await supabase
      .from('ingestion_runs')
      .update({
        status: 'success',
        inserted_count: insertedTotal,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    const nowIso = new Date().toISOString();
    await safeUpsertWorkerStatus({
      state: 'success',
      message: `성공 (insert: ${insertedTotal})`,
      last_event_at: nowIso,
      last_success_at: nowIso,
    });

    console.log('[yf-collector] 배치 성공 - insert:', insertedTotal);
    return { ok: true, skipped: false };
  } catch (e: unknown) {
    console.error('[yf-collector] 배치 실패', e);

    const errorMessage = e instanceof Error ? e.message : String(e);

    await safeUpsertWorkerStatus({
      state: 'failed',
      message: errorMessage,
      last_event_at: new Date().toISOString(),
    });

    await supabase
      .from('ingestion_runs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    return { ok: false, skipped: false };
  } finally {
    isRunning = false;
  }
}

async function loop() {
  const result = await runOnce();

  // 스킵은 실패가 아님 → 성공 주기 유지
  const successForScheduling = result.ok;

  const delay = nextDelayMs(successForScheduling);

  if (result.skipped) {
    // 스킵 상태에서는 콘솔을 조용하게 유지(필요하면 lastSkipReason 변경 시점에만 로그가 남음)
  } else if (result.ok) {
    console.log('[yf-collector] 다음 실행까지 대기:', Math.round(delay / 1000), '초');
  } else {
    console.warn(
      '[yf-collector] 실패 백오프 적용. 다음 재시도까지:',
      Math.round(delay / 1000),
      '초',
    );
  }

  setTimeout(loop, delay);
}

// 시작 시 한 번 실행, 이후 루프
void loop();
