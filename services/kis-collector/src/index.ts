/**
 * KIS 가격 수집 워커 (다종목 + 안정성 가드)
 */

import "dotenv/config";

import { fetchKrxPrice, KisTokenError, TokenCooldownError } from "./kis.js";
import { insertTick } from "./insertTick.js";
import { createBackoff } from "./backoff.js";
import {
  bumpErrorCount,
  getSystemGuard,
  recordLastSuccess,
  recordTokenCooldown,
  setTradingEnabled,
} from "./systemGuard.js";
import { loadActiveKisKrxSymbols, TrackedSymbol } from "./trackedSymbols.js";

console.log("[kis-collector] KIS 가격 수집 시작");

const refreshListMs = 10_000;
const loopMs = 200;

// 실패 누적 임계치 (전역 가드 초석)
const disableThreshold = 10;

type SymbolState = {
  nextRunAt: number;
  isRunning: boolean;
  backoff: ReturnType<typeof createBackoff>;
};

const states = new Map<string, SymbolState>();
let symbols: TrackedSymbol[] = [];
let refreshing = false;

// 쿨다운 로그 너무 자주 안 찍기용
let lastCooldownLogAt = 0;

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

async function refreshSymbols() {
  if (refreshing) return;
  refreshing = true;

  try {
    symbols = await loadActiveKisKrxSymbols();
    console.log(`[kis-collector] 추적 종목 갱신 (${symbols.length}개)`);
  } catch (e) {
    console.error("[kis-collector] 종목 목록 갱신 실패", e);
  } finally {
    refreshing = false;
  }
}

await refreshSymbols();
setInterval(() => void refreshSymbols(), refreshListMs);

setInterval(async () => {
  const now = Date.now();
  if (symbols.length === 0) return;

  for (const s of symbols) {
    const st = getState(s.symbol);

    if (st.isRunning) continue;
    if (now < st.nextRunAt) continue;

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

      // 최근 정상 수집 상태(웹 표시용)
      // 실패해도 수집 자체는 영향 없게 try/catch로 감쌈
      try {
        await recordLastSuccess({ symbol: s.symbol, price });
      } catch {
        // 조용히 무시 (웹 표시용이라 수집을 막지 않음)
      }

      st.backoff.reset();
      st.nextRunAt = Date.now() + baseIntervalMs;

      console.log(`[kis-collector] 수집 성공 ${s.symbol} ${price}`);
    } catch (e) {
      // ✅ 토큰 쿨다운은 “조용히” 처리 (종목별 실패 로그 X / 가드 카운트 X)
      if (e instanceof TokenCooldownError) {
        const logEveryMs = 2000;
        if (Date.now() - lastCooldownLogAt > logEveryMs) {
          lastCooldownLogAt = Date.now();
          const waitSec = Math.ceil(e.remainingMs / 1000);
          console.warn(`[kis-collector] 토큰 쿨다운 중 (${waitSec}s)`);
        }

        // 쿨다운이 끝나기 전에는 너무 자주 안 돌게끔 적당히 sleep
        st.nextRunAt =
          Date.now() + Math.max(2000, Math.min(e.remainingMs, 10_000));
        continue;
      }

      // 토큰 발급 실패는 1회만 DB 기록(쿨다운 상태 표시용)
      if (e instanceof KisTokenError) {
        console.error(`[kis-collector] 토큰 발급 실패 (status=${e.status})`);

        try {
          await recordTokenCooldown(60_000);
        } catch (guardErr) {
          console.error("[kis-collector] 토큰 쿨다운 기록 실패", guardErr);
        }
      } else {
        console.error(`[kis-collector] 수집 실패 ${s.symbol}`, e);
      }

      // 전역 가드: 실패 누적 -> trading_enabled OFF (초석)
      try {
        const guard = await getSystemGuard();
        const nextCount = guard.error_count + 1;

        await bumpErrorCount(nextCount);

        if (guard.trading_enabled && nextCount >= disableThreshold) {
          await setTradingEnabled(false);
          console.error("[kis-collector] 가드 작동 → 실거래 차단");
        }
      } catch (guardErr) {
        console.error("[kis-collector] 가드 처리 중 오류", guardErr);
      }

      // 종목별 백오프
      const delayMs = st.backoff.nextDelayMs();
      st.nextRunAt = Date.now() + delayMs;
      console.warn(
        `[kis-collector] 백오프 적용 ${s.symbol} ${Math.round(delayMs / 1000)}초`
      );
    } finally {
      st.isRunning = false;
    }
  }
}, loopMs);
