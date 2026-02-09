import { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import { DateTime } from 'luxon';

type BudgetState = {
  lastCallAt: number | null;
  hourlyCount: number;
  dailyCount: number;
  lastHourKey: string;
  lastDayKey: string;
};

const state: Record<string, BudgetState> = {};

function now() {
  return DateTime.now().toMillis();
}

function hourKey(d = DateTime.now().toUTC()) {
  return d.toISO({ suppressMilliseconds: true })?.slice(0, 13) ?? ''; // YYYY-MM-DDTHH
}

function dayKey(d = DateTime.now().toUTC()) {
  return d.toISODate() ?? '';
}

/** 시장/모드별 쿨다운(ms) */
export function getCooldownMs(market: Market, mode: MarketMode): number {
  if (market === Market.CRYPTO) {
    if (mode === 'CRYPTO_DAILY') return 6 * 60 * 60 * 1000; // 6시간
    return 60_000; // 크립토 장중: 1분 (24/7 실시간 모니터링)
  }

  if (mode === 'PRE_OPEN') return 10 * 60_000; // 10분
  if (mode === 'INTRADAY') return 5 * 60_000; // 5분 (변동성/중요도에 따라 5~10분)
  if (mode === 'CLOSE') return 5 * 60_000; // 5분
  if (mode === 'POST_CLOSE') return 30 * 60_000; // 30분 (최대 60분)

  return Infinity; // OFF
}

export function canCallLLM(market: Market, mode: MarketMode): boolean {
  const key = `${market}`;
  const s =
    state[key] ??
    (state[key] = {
      lastCallAt: null,
      hourlyCount: 0,
      dailyCount: 0,
      lastHourKey: hourKey(),
      lastDayKey: dayKey(),
    });

  const nowTs = now();

  // 쿨다운 체크
  const cooldown = getCooldownMs(market, mode);
  if (s.lastCallAt && nowTs - s.lastCallAt < cooldown) {
    return false;
  }

  // 시간 단위 리셋
  const hk = hourKey();
  if (s.lastHourKey !== hk) {
    s.hourlyCount = 0;
    s.lastHourKey = hk;
  }

  // 일 단위 리셋
  const dk = dayKey();
  if (s.lastDayKey !== dk) {
    s.dailyCount = 0;
    s.lastDayKey = dk;
  }

  // 제한값
  if (s.hourlyCount >= 120) return false;
  if (s.dailyCount >= 2000) return false;

  return true;
}

export function recordLLMCall(market: Market) {
  const s = state[market];
  if (!s) return;

  s.lastCallAt = now();
  s.hourlyCount += 1;
  s.dailyCount += 1;
}
