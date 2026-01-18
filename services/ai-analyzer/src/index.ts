/**
 * AI 분석 워커 (필터 A)
 *
 * 정책(추천 4번):
 * - 평일: 24시간 실행
 * - 주말/휴일(US): 실행 스킵 (DB 조회/AI 호출/매매 판단 없음)
 *
 * 호출 게이트:
 * - 후보(candidate)가 있을 때만 LLM 호출
 * - AI_ENABLED=true 일 때만 호출
 * - DUPLICATE_INPUT이면 호출 안 함
 */

import { DateTime } from "luxon";

import { envBool, envOptional } from "./utils/env.js";
import { sha256 } from "./utils/hash.js";
import { summarizeBars } from "./utils/ohlc.js";
import { buildAiContext } from "./utils/summary.js";

import { callAiFilter } from "./ai.js";
import { fetchRecentBars, hasAiResult, insertAnalysisRun, upsertAiResult } from "./db.js";
import { decideCandidate, loadCandidates, upsertCandidate } from "./candidates.js";
import { supabase } from "./supabase.js";
import type { Market } from "./types/ai.js";

console.log("[ai-analyzer] 시작");

const AI_ENABLED = envBool("AI_ENABLED", false);
const MARKET = (envOptional("AI_MARKET", "US") as Market) ?? "US";
const TIMEFRAME = envOptional("AI_TIMEFRAME", "1m");

const INTERVAL_MS = Number(envOptional("AI_INTERVAL_MS", String(15 * 60 * 1000)));
const WINDOW_MINUTES = Number(envOptional("AI_WINDOW_MINUTES", "240"));

const SYMBOLS = (envOptional("AI_SYMBOLS", "AAPL,TSLA") || "AAPL,TSLA")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function nowNy() {
  return DateTime.now().setZone("America/New_York");
}

function isWeekendNy(dt: DateTime) {
  // 6=Saturday, 7=Sunday
  return dt.weekday >= 6;
}

async function isUsHolidayNy(dateIso: string) {
  const { data, error } = await supabase
    .from("market_calendar")
    .select("status, reason")
    .eq("market", "US")
    .eq("venue", "NYSE")
    .eq("date", dateIso)
    .maybeSingle();

  if (error) {
    // 휴일 조회 실패는 "스킵"으로 만들지 않는다. (운영 중단 방지)
    console.error("[ai-analyzer] market_calendar 조회 실패", error);
    return { closed: false as const, reason: "" };
  }

  if (!data) return { closed: false as const, reason: "" };
  return { closed: data.status === "closed", reason: data.reason ?? "" };
}

function computeWindow() {
  const end = nowNy();
  const start = end.minus({ minutes: WINDOW_MINUTES });

  return {
    window_start: start.toUTC().toISO()!,
    window_end: end.toUTC().toISO()!,
  };
}

// 같은 스킵 사유가 반복될 때 로그/DB를 조용하게 유지하기 위한 캐시
let lastSkipReason: string | null = null;

async function recordGlobalSkip(params: {
  window_start: string;
  window_end: string;
  reason: string;
}) {
  // 같은 사유 반복이면 조용히
  if (lastSkipReason === params.reason) return;

  lastSkipReason = params.reason;

  console.log("[ai-analyzer] 실행 스킵:", params.reason);

  await insertAnalysisRun({
    market: MARKET,
    symbol: "__ALL__",
    input_hash: sha256(`${MARKET}:${TIMEFRAME}:${params.window_start}:${params.window_end}:${params.reason}`),
    window_start: params.window_start,
    window_end: params.window_end,
    status: "skipped",
    skip_reason: params.reason,
  });
}

async function runOnce() {
  const { window_start, window_end } = computeWindow();
  const dt = nowNy();

  // 0) 주말 스킵 (평일 24시간 실행 정책)
  if (isWeekendNy(dt)) {
    await recordGlobalSkip({ window_start, window_end, reason: "WEEKEND" });
    return;
  }

  // 1) 휴일 스킵
  const d = dt.toISODate();
  if (d) {
    const h = await isUsHolidayNy(d);
    if (h.closed) {
      const reason = `MARKET_HOLIDAY${h.reason ? ` (${h.reason})` : ""}`;
      await recordGlobalSkip({ window_start, window_end, reason });
      return;
    }
  }

  // 평일/비휴일로 돌아오면 스킵 캐시 리셋 + 재개 로그 1회
  if (lastSkipReason !== null) {
    lastSkipReason = null;
    console.log("[ai-analyzer] 평일/비휴일 감지 → 수집 재개");
  }

  // 2) 후보 생성(모든 심볼에 대해)
  for (const symbol of SYMBOLS) {
    try {
      const bars = await fetchRecentBars({
        market: MARKET,
        symbol,
        timeframe: TIMEFRAME,
        window_start,
        window_end,
      });

      // 데이터 부족이면 후보/AI 모두 스킵(심볼 단위로 기록)
      if (bars.length < 60) {
        await insertAnalysisRun({
          market: MARKET,
          symbol,
          input_hash: sha256(`${MARKET}:${symbol}:${TIMEFRAME}:${window_start}:${window_end}:INSUFFICIENT_BARS`),
          window_start,
          window_end,
          status: "skipped",
          skip_reason: "INSUFFICIENT_BARS",
        });
        continue;
      }

      const ohlc = summarizeBars(bars);
      const candidate = decideCandidate(ohlc);

      if (candidate.isCandidate) {
        await upsertCandidate({
          market: MARKET,
          symbol,
          timeframe: TIMEFRAME,
          window_end,
          score: candidate.score,
          reason: candidate.reason,
        });

        console.log("[ai-analyzer] 후보:", symbol, `score=${candidate.score}`, candidate.reason);
      }
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      console.error("[ai-analyzer] 후보 생성 실패:", symbol, msg);

      await insertAnalysisRun({
        market: MARKET,
        symbol,
        input_hash: sha256(`${MARKET}:${symbol}:${TIMEFRAME}:${window_start}:${window_end}:CAND_ERR:${msg}`),
        window_start,
        window_end,
        status: "failed",
        error_message: msg.slice(0, 300),
      });
    }
  }

  // 3) 이번 window_end 기준 후보 조회
  const candidates = await loadCandidates({ market: MARKET, window_end });

  if (candidates.length === 0) {
    console.log("[ai-analyzer] 후보 없음 → AI 호출 스킵");

    await insertAnalysisRun({
      market: MARKET,
      symbol: "__ALL__",
      input_hash: sha256(`${MARKET}:${TIMEFRAME}:${window_start}:${window_end}:NO_CANDIDATE`),
      window_start,
      window_end,
      status: "skipped",
      skip_reason: "NO_CANDIDATE",
    });

    return;
  }

  // 4) 후보가 있을 때만 AI 호출
  for (const c of candidates) {
    const symbol = c.symbol as string;
    const t0 = Date.now();

    try {
      const bars = await fetchRecentBars({
        market: MARKET,
        symbol,
        timeframe: TIMEFRAME,
        window_start,
        window_end,
      });

      if (bars.length < 60) {
        await insertAnalysisRun({
          market: MARKET,
          symbol,
          input_hash: sha256(`${MARKET}:${symbol}:${TIMEFRAME}:${window_start}:${window_end}:INSUFFICIENT_BARS_2`),
          window_start,
          window_end,
          status: "skipped",
          skip_reason: "INSUFFICIENT_BARS",
        });
        continue;
      }

      const ohlc = summarizeBars(bars);
      const context = buildAiContext({
        market: MARKET,
        symbol,
        timeframe: TIMEFRAME,
        windowMinutes: WINDOW_MINUTES,
        ohlc,
      });

      const input_hash = sha256(context);

      const dup = await hasAiResult({
        market: MARKET,
        symbol,
        window_end,
        input_hash,
      });

      if (dup) {
        await insertAnalysisRun({
          market: MARKET,
          symbol,
          input_hash,
          window_start,
          window_end,
          status: "skipped",
          skip_reason: "DUPLICATE_INPUT",
        });
        continue;
      }

      if (!AI_ENABLED) {
        await insertAnalysisRun({
          market: MARKET,
          symbol,
          input_hash,
          window_start,
          window_end,
          status: "skipped",
          skip_reason: "AI_DISABLED",
        });
        continue;
      }

      const ai = await callAiFilter({ context });

      await upsertAiResult({
        market: MARKET,
        symbol,
        timeframe: TIMEFRAME,
        window_start,
        window_end,
        input_hash,
        result: ai.result,
      });

      const latency_ms = Date.now() - t0;
      const usage = ai.usage ?? {};

      await insertAnalysisRun({
        market: MARKET,
        symbol,
        input_hash,
        window_start,
        window_end,
        status: "success",
        latency_ms,
        model: ai.model ?? null,
        prompt_tokens: usage.prompt_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? null,
        total_tokens: usage.total_tokens ?? null,
      });

      console.log(
        "[ai-analyzer] 저장:",
        symbol,
        ai.result.decision,
        `conf=${ai.result.confidence.toFixed(2)}`,
        ai.result.reason
      );
    } catch (e: any) {
      const latency_ms = Date.now() - t0;
      const msg = String(e?.message ?? e);

      console.error("[ai-analyzer] AI 실패:", symbol, msg);

      await insertAnalysisRun({
        market: MARKET,
        symbol,
        input_hash: sha256(`${MARKET}:${symbol}:${TIMEFRAME}:${window_start}:${window_end}:AI_ERR:${msg}`),
        window_start,
        window_end,
        status: "failed",
        error_message: msg.slice(0, 300),
        latency_ms,
      });
    }
  }
}

async function loop() {
  await runOnce();
  setTimeout(loop, INTERVAL_MS);
}

console.log("[ai-analyzer] 모드:", AI_ENABLED ? "ON" : "OFF");
console.log("[ai-analyzer] 대상:", MARKET, TIMEFRAME, `window=${WINDOW_MINUTES}m`, SYMBOLS.join(","));
void loop();