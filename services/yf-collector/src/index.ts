/**
 * yfinance(=Yahoo Chart API) 배치 수집 워커
 * - 기본: 15분 주기
 * - 실패 시: 지수 백오프(최대 15분)
 * - 실행 조건(옵션):
 *   - MARKET_ONLY: 미국 정규장(09:30~16:00 ET) + 휴일/주말 스킵
 *   - EXTENDED: 프리/애프터 포함(04:00~20:00 ET) + 휴일/주말 스킵
 *   - ALWAYS: 24시간 실행(휴일도 실행)
 */

import { DateTime } from "luxon";
import { supabase } from "./supabase";
import { fetchYahooBars } from "./fetchYahoo";
import { upsertBars } from "./db";

const SYMBOLS = ["AAPL", "TSLA"];
const TIMEFRAME = "1m";

// 정상 주기(성공 시)
const BASE_LOOP_MS = 15 * 60 * 1000;

// 실패 백오프(최소 30초 ~ 최대 BASE_LOOP_MS)
const BACKOFF_MIN_MS = 30_000;
const BACKOFF_MAX_MS = BASE_LOOP_MS;

type RunMode = "MARKET_ONLY" | "EXTENDED" | "ALWAYS";

function env(name: string) {
  const v = process.env[name];
  return v ?? "";
}

const RUN_MODE = (env("YF_RUN_MODE") || "MARKET_ONLY") as RunMode;

// 2편 기준: 휴일은 “최소만” 하드코딩 (필요 시 추가)
// ※ 정확한 전체 휴장 캘린더는 다음 편에서 개선 가능
const US_MARKET_HOLIDAYS = new Set<string>([
  "2026-01-01", // New Year's Day
  "2026-01-19", // MLK Day
  "2026-02-16", // Washington's Birthday
  // 필요 시 추가
]);

const SERVICE_NAME = "yf-collector" as const;

type WorkerState = "unknown" | "running" | "success" | "failed" | "skipped";

async function safeUpsertWorkerStatus(params: {
  state: WorkerState;
  message?: string | null;
  last_event_at?: string;
  last_success_at?: string | null;
}) {
  try {
    const nowIso = new Date().toISOString();

    const { error } = await supabase.from("worker_status").upsert(
      {
        service: SERVICE_NAME,
        run_mode: RUN_MODE,
        state: params.state,
        message: params.message ?? null,
        last_event_at: params.last_event_at ?? nowIso,
        last_success_at: params.last_success_at ?? null,
        updated_at: nowIso,
      },
      { onConflict: "service" }
    );

    if (error) {
      console.error("[yf-collector] worker_status 업데이트 실패", error);
    }
  } catch (e) {
    console.error("[yf-collector] worker_status 업데이트 예외", e);
  }
}

function nowNy() {
  return DateTime.now().setZone("America/New_York");
}

function isWeekend(dt: DateTime) {
  // 6=Saturday, 7=Sunday
  return dt.weekday >= 6;
}

function isHoliday(dt: DateTime) {
  const d = dt.toISODate();
  if (!d) return false;
  return US_MARKET_HOLIDAYS.has(d);
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
function shouldSkipNow() {
  const dt = nowNy();

  if (RUN_MODE === "ALWAYS") {
    return { skip: false as const, reason: "" };
  }

  if (isWeekend(dt)) {
    return { skip: true as const, reason: "주말" };
  }

  if (isHoliday(dt)) {
    return { skip: true as const, reason: "미국장 휴일" };
  }

  if (RUN_MODE === "EXTENDED") {
    if (!isInExtendedHours(dt))
      return { skip: true as const, reason: "장외(확장시간 아님)" };
    return { skip: false as const, reason: "" };
  }

  // MARKET_ONLY
  if (!isInMarketHours(dt))
    return { skip: true as const, reason: "장외(정규장 아님)" };
  return { skip: false as const, reason: "" };
}

console.log("[yf-collector] 해외주식 배치 수집 시작");
console.log("[yf-collector] 실행 모드:", RUN_MODE);

await safeUpsertWorkerStatus({ state: "unknown", message: "시작됨" });

// 프로세스 내부 중복 실행 방지
let isRunning = false;

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
    console.warn(
      "[yf-collector] 이전 실행이 아직 끝나지 않아 이번 실행은 건너뜀"
    );
    return { ok: true, skipped: true };
  }

  const { skip, reason } = shouldSkipNow();
  if (skip) {
    console.log("[yf-collector] 실행 스킵:", reason);

    await safeUpsertWorkerStatus({
      state: "skipped",
      message: reason,
      last_event_at: new Date().toISOString(),
    });

    return { ok: true, skipped: true }; // 실패 아님
  }

  isRunning = true;

  await safeUpsertWorkerStatus({
    state: "running",
    message: "수집 중",
    last_event_at: new Date().toISOString(),
  });

  const startedAt = new Date().toISOString();

  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({
      job: "yfinance-equity",
      symbols: SYMBOLS,
      timeframe: TIMEFRAME,
      started_at: startedAt,
      status: "running",
    })
    .select()
    .single();

  if (runError || !run) {
    console.error("[yf-collector] ingestion_runs 시작 기록 실패", runError);
    isRunning = false;
    return { ok: false, skipped: false };
  }

  try {
    let insertedTotal = 0;

    for (const symbol of SYMBOLS) {
      const bars = await fetchYahooBars(symbol);
      const { inserted } = await upsertBars(symbol, TIMEFRAME, bars);
      insertedTotal += inserted;

      console.log("[yf-collector] 수집 완료:", symbol, `(${bars.length} bars)`);
    }

    await supabase
      .from("ingestion_runs")
      .update({
        status: "success",
        inserted_count: insertedTotal,
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

    const nowIso = new Date().toISOString();
    await safeUpsertWorkerStatus({
      state: "success",
      message: `성공 (insert: ${insertedTotal})`,
      last_event_at: nowIso,
      last_success_at: nowIso,
    });

    console.log("[yf-collector] 배치 성공 - insert:", insertedTotal);
    return { ok: true, skipped: false };
  } catch (e: any) {
    console.error("[yf-collector] 배치 실패", e);

    await safeUpsertWorkerStatus({
      state: "failed",
      message: String(e?.message ?? e),
      last_event_at: new Date().toISOString(),
    });

    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        error_message: String(e?.message ?? e),
        finished_at: new Date().toISOString(),
      })
      .eq("id", run.id);

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
    console.log(
      "[yf-collector] 다음 실행까지 대기:",
      Math.round(delay / 1000),
      "초"
    );
  } else if (result.ok) {
    console.log(
      "[yf-collector] 다음 실행까지 대기:",
      Math.round(delay / 1000),
      "초"
    );
  } else {
    console.warn(
      "[yf-collector] 실패 백오프 적용. 다음 재시도까지:",
      Math.round(delay / 1000),
      "초"
    );
  }

  setTimeout(loop, delay);
}

// 시작 시 한 번 실행, 이후 루프
await runOnce();
setTimeout(loop, BASE_LOOP_MS);
