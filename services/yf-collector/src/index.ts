/**
 * yfinance(=Yahoo Chart API) 배치 수집 워커
 * - 기본: 15분 주기
 * - 실패 시: 지수 백오프(최대 15분)
 * - 실행 조건(옵션):
 *   - MARKET: 미국 정규장(09:30~16:00 ET) + 휴일/주말 스킵
 *   - PREMARKET: 프리마켓(04:00~09:30 ET) + 휴일/주말 스킵
 *   - AFTERMARKET: 애프터마켓(16:00~20:00 ET) + 휴일/주말 스킵
 *   - EXTENDED: 프리/애프터 포함(04:00~20:00 ET) + 휴일/주말 스킵
 *   - NO_CHECK: 장시간 확인 안 함 (휴일도 실행)
 *
 * ✅ 타겟 구성 규칙 (우선순위 + 중복 제거)
 * 1) positions (보유 종목)        : 항상 포함 / 절대 cash-skip 하지 않음
 * 2) symbol_universe (DB 등록 종목): enabled=true 종목 포함
 * 3) auto (자동 후보)             : 하드코딩된 대형주 리스트
 *
 * ✅ 현금 잔고 필터링
 * - account_cash에서 USD 잔고 조회
 * - 1주라도 매수 불가능한 종목은 auto에서만 제외
 * - positions, symbol_universe는 무조건 포함
 *
 * ✅ RPS 제한
 * - throttle 적용 (기본 2 RPS, 환경변수로 조정 가능)
 */

import 'dotenv/config';
import { DateTime } from 'luxon';
import { env, envNumber, nowIso, type Nullable } from '@workspace/shared-utils';
import { supabase } from './db/supabase.js';
import { fetchYahooBars } from './fetchYahoo.js';
import { upsertBars } from './db/db.js';
import { loadAccountCash } from './accountCash.js';
import { loadEnabledUniverseSymbols } from './symbolUniverse.js';
import { loadAutoUsSymbols } from './autoCandidates.js';
import { loadOpenPositionSymbols } from './positions.js';
import { createGlobalThrottle } from './utils/throttle.js';

const TIMEFRAME = '15m';

// 정상 주기(성공 시)
const BASE_LOOP_MS = 15 * 60 * 1000;

// 실패 백오프(최소 30초 ~ 최대 BASE_LOOP_MS)
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = BASE_LOOP_MS;

// 최대 수집 종목 수
const MAX_TARGET_SYMBOLS = 15;

// 자동 후보 최대 개수 (최종 포함 수는 MAX_TARGET_SYMBOLS - positions - universe)
const AUTO_CANDIDATE_LIMIT = 50;

// 현금 부족 판정 시 버퍼(수수료/호가 변동 대비)
const CASH_BUFFER_RATIO = 0.98;

// 예수금 갱신 주기
const CASH_REFRESH_MS = 60_000;

// RPS 제한 (Yahoo Finance는 비공식 API이므로 보수적으로)
const YF_RPS = Math.floor(envNumber('YF_RPS', 2) ?? 2);

type RunMode = 'MARKET' | 'PREMARKET' | 'AFTERMARKET' | 'EXTENDED' | 'NO_CHECK';

function parseRunMode(raw: string | undefined): RunMode {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized || normalized === 'MARKET_ONLY' || normalized === 'MARKET') return 'MARKET';
  if (normalized === 'PREMARKET') return 'PREMARKET';
  if (normalized === 'AFTERMARKET') return 'AFTERMARKET';
  if (normalized === 'EXTENDED') return 'EXTENDED';
  if (normalized === 'ALWAYS' || normalized === 'NO_CHECK') return 'NO_CHECK';
  throw new Error(
    `YF_RUN_MODE must be one of MARKET|PREMARKET|AFTERMARKET|EXTENDED|NO_CHECK, got: ${raw}`,
  );
}

const RUN_MODE = parseRunMode(env('YF_RUN_MODE'));

const SERVICE_NAME = 'yf-collector' as const;

type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

async function safeUpsertWorkerStatus(params: {
  state: WorkerState;
  message?: Nullable<string>;
  last_event_at?: string;
  last_success_at?: Nullable<string>;
}) {
  try {
    const ts = nowIso();

    const { error } = await supabase.from('worker_status').upsert(
      {
        service: SERVICE_NAME,
        run_mode: RUN_MODE,
        state: params.state,
        message: params.message ?? null,
        last_event_at: params.last_event_at ?? ts,
        last_success_at: params.last_success_at ?? null,
        updated_at: ts,
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

  if (RUN_MODE === 'NO_CHECK') {
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

  if (RUN_MODE === 'PREMARKET') {
    const m = minutesOfDay(dt);
    if (m < 4 * 60 || m > 9 * 60 + 30) return { skip: true as const, reason: '장외(프리마켓 아님)' };
    return { skip: false as const, reason: '' };
  }

  if (RUN_MODE === 'AFTERMARKET') {
    const m = minutesOfDay(dt);
    if (m < 16 * 60 || m > 20 * 60) return { skip: true as const, reason: '장외(애프터마켓 아님)' };
    return { skip: false as const, reason: '' };
  }

  if (RUN_MODE === 'EXTENDED') {
    if (!isInExtendedHours(dt)) return { skip: true as const, reason: '장외(확장시간 아님)' };
    return { skip: false as const, reason: '' };
  }

  // MARKET
  if (!isInMarketHours(dt)) return { skip: true as const, reason: '장외(정규장 아님)' };
  return { skip: false as const, reason: '' };
}

type TargetSource = 'positions' | 'symbol_universe' | 'auto';

type TargetSymbol = {
  symbol: string;
  source: TargetSource;
  lastPrice?: number; // 현금 필터용
};

/**
 * 코인 심볼 판별 (BTC-USD, ETH-USD 등 제외)
 */
function isCryptoSymbol(symbol: string): boolean {
  return symbol.includes('-');
}

/**
 * 타겟 종목 선정 (우선순위 + 중복 제거)
 */
async function loadTargetSymbols(): Promise<TargetSymbol[]> {
  // 1) positions (보유 종목)
  const positionSymbols = await loadOpenPositionSymbols({ market: 'US', limit: 200 });
  const positionStocksOnly = positionSymbols.filter((s) => !isCryptoSymbol(s));

  // 2) symbol_universe (enabled=true)
  const universeRows = await loadEnabledUniverseSymbols({ market: 'US', limit: 500 });
  const universeSymbols = universeRows
    .map((r) => String(r.symbol || '').trim())
    .filter((s) => s.length > 0 && !isCryptoSymbol(s));

  // 3) auto (자동 후보)
  const autoCandidates = await loadAutoUsSymbols({ limit: AUTO_CANDIDATE_LIMIT });
  const autoSymbols = autoCandidates
    .map((c) => String(c.symbol || '').trim())
    .filter((s) => s.length > 0 && !isCryptoSymbol(s));

  // TargetSymbol로 변환
  const positionTargets: TargetSymbol[] = positionStocksOnly.map((sym) => ({
    symbol: sym,
    source: 'positions' as const,
  }));

  const universeTargets: TargetSymbol[] = universeSymbols.map((sym) => ({
    symbol: sym,
    source: 'symbol_universe' as const,
  }));

  const autoTargets: TargetSymbol[] = autoSymbols.map((sym) => ({
    symbol: sym,
    source: 'auto' as const,
  }));

  // 4) 합치기 (우선순위 유지)
  const merged = [...positionTargets, ...universeTargets, ...autoTargets];

  // 5) 중복 제거 (우선순위 유지)
  const seen = new Set<string>();
  const unique: TargetSymbol[] = [];
  for (const t of merged) {
    if (!t.symbol || seen.has(t.symbol)) continue;
    seen.add(t.symbol);
    unique.push(t);
  }

  // 6) 최대 개수 제한
  const limited = unique.slice(0, MAX_TARGET_SYMBOLS);

  // 7) 현금 필터는 여기서는 하지 않음 (가격 정보가 없어서)
  // 대신 수집 시 가격을 확인하고, auto만 스킵하는 방식

  console.log(
    `[yf-collector] 타겟 선정 | positions=${positionTargets.length} | universe=${universeTargets.length} | auto=${autoTargets.length} | final=${limited.length}`,
  );

  return limited;
}

// 현금 상태 캐시
let latestUsdCash: number | null = null;
let cashRefreshRunning = false;

/**
 * 현금 잔고 조회
 */
async function loadCash(): Promise<number | null> {
  if (cashRefreshRunning) return latestUsdCash;
  cashRefreshRunning = true;

  try {
    const row = await loadAccountCash({
      broker: 'KIS',
      market: 'US',
      currency: 'USD',
    });

    const cash =
      typeof row?.cash_available === 'number' && Number.isFinite(row.cash_available)
        ? row.cash_available
        : null;

    if (cash !== null) {
      latestUsdCash = cash;
      console.log('[yf-collector] USD 현금 갱신', Math.floor(cash));
    } else {
      console.log('[yf-collector] USD 현금 갱신: 값 없음(null)');
    }

    return latestUsdCash;
  } catch (e) {
    console.error('[yf-collector] cash load error', e);
    return latestUsdCash;
  } finally {
    cashRefreshRunning = false;
  }
}

console.log('[yf-collector] 해외주식 배치 수집 시작');
console.log('[yf-collector] 실행 모드:', RUN_MODE);
console.log(`[yf-collector] throttle: RPS=${YF_RPS} | 최대 종목=${MAX_TARGET_SYMBOLS}`);

await safeUpsertWorkerStatus({ state: 'unknown', message: '시작됨' });

// 예수금 60초 주기 갱신
await loadCash();
setInterval(() => void loadCash(), CASH_REFRESH_MS);

// 프로세스 내부 중복 실행 방지
let isRunning = false;
// 스킵 상태(사유) 캐시: 같은 사유로 계속 스킵될 때 로그/DB 업데이트를 반복하지 않음
let lastSkipReason: Nullable<string> = null;

// 백오프 상태
let backoffMs = BACKOFF_MIN_MS;

// throttle
const throttle = createGlobalThrottle({ rps: YF_RPS, label: 'Yahoo' });

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
        last_event_at: nowIso(),
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
    last_event_at: nowIso(),
  });

  const startedAt = nowIso();

  // 현금 잔고 조회
  const availableUsd = await loadCash();

  // 타겟 종목 선정
  const targets = await loadTargetSymbols();

  if (targets.length === 0) {
    console.log('[yf-collector] 수집 대상 종목이 없음');
    isRunning = false;
    return { ok: true, skipped: true };
  }

  const { data: run, error: runError } = await supabase
    .from('ingestion_runs')
    .insert({
      job: 'yfinance-equity',
      symbols: targets.map((t) => t.symbol),
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

    for (const target of targets) {
      try {
        // throttle 적용
        const bars = await throttle.run(() => fetchYahooBars(target.symbol));

        if (bars.length === 0) {
          console.log('[yf-collector] bars 없음:', target.symbol);
          continue;
        }

        // 최신 가격 확인 (현금 필터용)
        const latestBar = bars[bars.length - 1];
        const latestPrice = latestBar.close ?? latestBar.open ?? latestBar.high ?? latestBar.low;

        // 현금 필터: auto만 적용
        if (target.source === 'auto' && availableUsd !== null && latestPrice !== null) {
          if (latestPrice > availableUsd * CASH_BUFFER_RATIO) {
            console.log(
              '[yf-collector][skip-by-cash]',
              target.symbol,
              'lastPrice=',
              latestPrice,
              'cash=',
              Math.floor(availableUsd),
            );
            continue;
          }
        }

        const { inserted } = await upsertBars(target.symbol, TIMEFRAME, bars);
        insertedTotal += inserted;

        console.log('[yf-collector] 수집 완료:', target.symbol, `(${bars.length} bars)`);
      } catch (e) {
        console.error('[yf-collector] 종목 수집 실패:', target.symbol, e);
        // 개별 종목 실패는 전체 실행을 중단하지 않음
      }
    }

    await supabase
      .from('ingestion_runs')
      .update({
        status: 'success',
        inserted_count: insertedTotal,
        finished_at: nowIso(),
      })
      .eq('id', run.id);

    const ts = nowIso();
    await safeUpsertWorkerStatus({
      state: 'success',
      message: `성공 (insert: ${insertedTotal})`,
      last_event_at: ts,
      last_success_at: ts,
    });

    console.log('[yf-collector] 배치 성공 - insert:', insertedTotal);
    return { ok: true, skipped: false };
  } catch (e: unknown) {
    console.error('[yf-collector] 배치 실패', e);

    const errorMessage = e instanceof Error ? e.message : String(e);

    await safeUpsertWorkerStatus({
      state: 'failed',
      message: errorMessage,
      last_event_at: nowIso(),
    });

    await supabase
      .from('ingestion_runs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        finished_at: nowIso(),
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
