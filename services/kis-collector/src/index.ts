/**
 * KIS 가격 수집 워커 (다종목 + 안정성 가드 + 장시간 스킵)
 */

import 'dotenv/config';
import { requireEnv as env, createBackoff } from '@workspace/shared-utils';
import { upsertWorkerStatus } from '@workspace/db-client';
import { fetchKrxPrice, fetchAccountBalance, TokenCooldownError } from './kis';
import { insertTick } from './insertTick';
import { bumpErrorCount, getSystemGuard, setTradingEnabled } from './systemGuard';
import { loadActiveKisKrxSymbols, TrackedSymbol } from './trackedSymbols';
import type { Nullable } from './types/utils';
import { createIngestionRun, finishIngestionRun, failIngestionRun } from './ingestionRuns';

// 실행 모드
// - MARKET_ONLY: 정규장(09:00~15:30 KST)만 실행 (기본)
// - EXTENDED: 08:00~16:00 KST
// - ALWAYS: 24시간 실행

type RunMode = 'MARKET_ONLY' | 'EXTENDED' | 'ALWAYS';

type SymbolState = {
  nextRunAt: number;
  isRunning: boolean;
  backoff: ReturnType<typeof createBackoff>;
};

const KIS_RUN_MODE = env('KIS_RUN_MODE');

const RUN_MODE = ((KIS_RUN_MODE as RunMode | undefined) || 'MARKET_ONLY') as RunMode;

console.log('[kis-collector] KIS 가격 수집 시작');

// 심볼 목록 리프레시 주기
const refreshListMs = 10_000;

// 내부 루프 tick (심볼별 폴링 스케줄러가 이 tick 안에서 돌아감)
const loopMs = 200;

// 실패 누적 임계치 (전역 가드 초석)
const disableThreshold = 10;

const states = new Map<string, SymbolState>();
let symbols: TrackedSymbol[] = [];
let refreshing = false;

// 메인 루프가 겹쳐 실행되는 것을 방지
let mainLoopRunning = false;

// 성공 상태 갱신을 너무 자주 하지 않도록(과도한 DB write 방지)
let lastSuccessStatusAtMs = 0;
const SUCCESS_STATUS_MIN_INTERVAL_MS = 3_000;

// 장시간 스킵 상태(로그/DB 업데이트 소음 방지용)
let lastSkipReason: Nullable<string> = null;

// ingestion run 추적 (1분 주기로 배치 기록)
const INGESTION_RUN_INTERVAL_MS = 60_000; // 1분
let currentRunId: Nullable<number> = null;
let currentRunStartedAt = 0;
const currentRunSymbols = new Set<string>();
let currentRunInsertCount = 0;
let currentRunErrors: string[] = [];

function getState(symbol: string) {
  const existing = states.get(symbol);
  if (existing) return existing;

  const created: SymbolState = {
    nextRunAt: Date.now(),
    isRunning: false,
    backoff: createBackoff({ baseMs: 1000, maxMs: 30_000 }),
  };
  states.set(symbol, created);
  return created;
}

function nowKst() {
  // KST 고정
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
}

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function isWeekendKst(d: Date) {
  // 0=Sun, 6=Sat
  const day = d.getDay();
  return day === 0 || day === 6;
}

function shouldSkipNow(): { skip: boolean; reason: string } {
  if (RUN_MODE === 'ALWAYS') return { skip: false, reason: '' };

  const d = nowKst();

  if (isWeekendKst(d)) return { skip: true, reason: '주말' };

  const m = minutesOfDay(d);

  // MARKET_ONLY: 09:00 ~ 15:30
  if (RUN_MODE === 'MARKET_ONLY') {
    const open = 9 * 60; // 540
    const close = 15 * 60 + 30; // 930
    if (m < open || m > close) return { skip: true, reason: '장외(정규장 아님)' };
    return { skip: false, reason: '' };
  }

  // EXTENDED: 08:00 ~ 16:00
  const openEx = 8 * 60; // 480
  const closeEx = 16 * 60; // 960
  if (m < openEx || m > closeEx) return { skip: true, reason: '장외(확장시간 아님)' };
  return { skip: false, reason: '' };
}

/**
 * 새로운 ingestion run 시작
 */
async function startNewIngestionRun() {
  try {
    // 이전 run 종료
    if (currentRunId !== null) {
      await finishCurrentIngestionRun();
    }

    // 새 run 시작
    const runId = await createIngestionRun({
      job: 'kis-equity',
      symbols: symbols.map((s) => s.symbol),
      timeframe: 'tick', // 실시간 틱 데이터
    });

    currentRunId = runId;
    currentRunStartedAt = Date.now();
    currentRunSymbols.clear();
    currentRunInsertCount = 0;
    currentRunErrors = [];

    console.log('[kis-collector] ingestion run 시작:', runId);
  } catch (e) {
    console.error('[kis-collector] ingestion run 시작 실패', e);
  }
}

/**
 * 현재 ingestion run 종료
 */
async function finishCurrentIngestionRun() {
  if (currentRunId === null) return;

  try {
    if (currentRunErrors.length > 0) {
      // 에러가 있으면 failed
      await failIngestionRun(currentRunId, currentRunErrors.join('; '));
      console.log(
        `[kis-collector] ingestion run 실패: ${currentRunId} | errors=${currentRunErrors.length}`,
      );
    } else {
      // 에러 없으면 success
      await finishIngestionRun(currentRunId, currentRunInsertCount);
      console.log(
        `[kis-collector] ingestion run 완료: ${currentRunId} | inserted=${currentRunInsertCount} | symbols=${currentRunSymbols.size}`,
      );
    }
  } catch (e) {
    console.error('[kis-collector] ingestion run 종료 실패', e);
  } finally {
    currentRunId = null;
  }
}

async function refreshSymbols() {
  if (refreshing) return;
  refreshing = true;

  try {
    symbols = await loadActiveKisKrxSymbols();
  } catch (e) {
    console.error('[kis-collector] symbols refresh error', e);
  } finally {
    refreshing = false;
  }
}

// 예수금 조회 함수
async function checkAccountBalance() {
  try {
    await fetchAccountBalance();
  } catch (e) {
    // 토큰 쿨다운 에러는 조용히 스킵 (1분간 요청 스킵, 다음 주기에 자동 재시도)
    if (e instanceof TokenCooldownError) {
      return;
    }
    console.error('[kis-collector] 예수금 조회 에러', e);
  }
}

// 초기 상태 기록
await upsertWorkerStatus({
  service: 'kis-collector',
  run_mode: RUN_MODE,
  state: 'unknown',
  message: '시작됨',
});

// 초기 예수금 조회
await checkAccountBalance();

await refreshSymbols();
setInterval(() => void refreshSymbols(), refreshListMs);

// 예수금 1분마다 조회
const balanceCheckMs = 1 * 60 * 1000; // 1분
setInterval(() => void checkAccountBalance(), balanceCheckMs);

// ingestion run 주기 (1분마다 새로운 배치 사이클)
await startNewIngestionRun();
setInterval(() => void startNewIngestionRun(), INGESTION_RUN_INTERVAL_MS);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[kis-collector] SIGINT 수신, 종료 중...');
  await finishCurrentIngestionRun();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[kis-collector] SIGTERM 수신, 종료 중...');
  await finishCurrentIngestionRun();
  process.exit(0);
});

setInterval(async () => {
  if (mainLoopRunning) return;
  mainLoopRunning = true;

  const now = Date.now();

  try {
    // 장시간 스킵 판정(루프 전체 스킵)
    const { skip, reason } = shouldSkipNow();
    if (skip) {
      // 스킵 사유가 바뀔 때만 1회 기록(조용하게)
      if (lastSkipReason !== reason) {
        lastSkipReason = reason;
        console.log('[kis-collector] 실행 스킵:', reason);

        await upsertWorkerStatus({
          service: 'kis-collector',
          run_mode: RUN_MODE,
          state: 'skipped',
          message: reason,
          last_event_at: new Date().toISOString(),
        });
      }
      return;
    }

    // 정상 구간에 들어오면 스킵 상태 해제(배지 자동 사라지게)
    if (lastSkipReason !== null) {
      lastSkipReason = null;
      await upsertWorkerStatus({
        service: 'kis-collector',
        run_mode: RUN_MODE,
        state: 'running',
        message: '수집 재개',
        last_event_at: new Date().toISOString(),
      });
    }

    if (symbols.length === 0) return;

    for (const s of symbols) {
      const st = getState(s.symbol);

      if (st.isRunning) continue;
      if (now < st.nextRunAt) continue;

      // 종목별 기본 주기 (너무 짧으면 방지)
      const baseIntervalMs = Math.max(500, s.poll_interval_ms);

      st.isRunning = true;

      try {
        const ts = new Date().toISOString();
        const { price, raw } = await fetchKrxPrice(s.broker_code);

        await insertTick({
          symbol: s.symbol,
          ts,
          price,
          raw,
        });

        st.backoff.reset();
        st.nextRunAt = Date.now() + baseIntervalMs;

        // ingestion run 추적
        currentRunSymbols.add(s.symbol);
        currentRunInsertCount++;

        // 로그는 심플하게
        console.log('[kis-collector][tick]', s.symbol, price);

        // 워커 상태는 너무 자주 갱신하지 않도록(과도한 DB write 방지)
        const nowMs = Date.now();
        if (nowMs - lastSuccessStatusAtMs >= SUCCESS_STATUS_MIN_INTERVAL_MS) {
          lastSuccessStatusAtMs = nowMs;
          await upsertWorkerStatus({
            service: 'kis-collector',
            run_mode: RUN_MODE,
            state: 'success',
            message: '정상 수집',
            last_event_at: ts,
            last_success_at: ts,
          });
        }
      } catch (e) {
        console.error('[kis-collector][tick error]', s.symbol, e);

        // ingestion run 에러 기록
        const errMsg = e instanceof Error ? e.message : String(e);
        currentRunErrors.push(`${s.symbol}: ${errMsg}`);

        // 전역 가드: 실패 누적 -> trading_enabled OFF (초석)
        try {
          const guard = await getSystemGuard();
          const nextCount = guard.error_count + 1;

          await bumpErrorCount(nextCount);

          if (guard.trading_enabled && nextCount >= disableThreshold) {
            await setTradingEnabled(false);
            console.error('[kis-collector][guard] trading_enabled=false (threshold reached)');
          }
        } catch (guardErr) {
          console.error('[kis-collector][guard error]', guardErr);
        }

        // 워커 상태 "실패"
        await upsertWorkerStatus({
          service: 'kis-collector',
          run_mode: RUN_MODE,
          state: 'failed',
          message: e instanceof Error ? e.message : String(e),
          last_event_at: new Date().toISOString(),
        });

        // 종목별 백오프
        st.nextRunAt = Date.now() + st.backoff.nextDelayMs();
      } finally {
        st.isRunning = false;
      }
    }
  } finally {
    mainLoopRunning = false;
  }
}, loopMs);
