import { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import { DateTime } from 'luxon';
import { getDailyCallCount, recordAICall } from '@workspace/db-client';

type BudgetState = {
  lastCallAt: number | null;
  hourlyCount: number;
  lastHourKey: string;
};

// 메모리: 시간별 카운터만 (재시작하면 초기화되지만 시간당 제한은 보수적으로 적용)
const state: Record<string, BudgetState> = {};

function now() {
  return DateTime.now().toMillis();
}

function hourKey(d = DateTime.now().toUTC()) {
  return d.toISO({ suppressMilliseconds: true })?.slice(0, 13) ?? ''; // YYYY-MM-DDTHH
}

function today() {
  return DateTime.now().toUTC().toISODate() ?? '';
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

/**
 * AI 호출 가능 여부 확인
 *
 * - 쿨다운: 메모리 기반 (재시작 시 리셋)
 * - 시간당 제한: 메모리 기반 (재시작 시 리셋)
 * - 일일 제한: DB 기반 (재시작해도 유지)
 */
export async function canCallLLM(market: Market, mode: MarketMode): Promise<boolean> {
  const key = `${market}`;
  const s =
    state[key] ??
    (state[key] = {
      lastCallAt: null,
      hourlyCount: 0,
      lastHourKey: hourKey(),
    });

  const nowTs = now();

  // 1. 쿨다운 체크 (메모리)
  const cooldown = getCooldownMs(market, mode);
  if (s.lastCallAt && nowTs - s.lastCallAt < cooldown) {
    return false;
  }

  // 2. 시간 단위 리셋 (메모리)
  const hk = hourKey();
  if (s.lastHourKey !== hk) {
    s.hourlyCount = 0;
    s.lastHourKey = hk;
  }

  // 3. 시간당 제한 (메모리)
  const HOURLY_LIMIT = process.env.AI_HOURLY_LIMIT
    ? parseInt(process.env.AI_HOURLY_LIMIT, 10)
    : 120;
  if (s.hourlyCount >= HOURLY_LIMIT) {
    return false;
  }

  // 4. 일일 제한 (DB 조회)
  try {
    const dailyCount = await getDailyCallCount({ date: today(), market });
    const DAILY_LIMIT = process.env.AI_DAILY_LIMIT
      ? parseInt(process.env.AI_DAILY_LIMIT, 10)
      : 2000;

    if (dailyCount >= DAILY_LIMIT) {
      console.log(
        `[AI Budget] 일일 한도 도달 | market=${market} | count=${dailyCount}/${DAILY_LIMIT}`
      );
      return false;
    }
  } catch (error) {
    console.error('[AI Budget] DB 조회 실패 - 예산 체크 스킵', error);
    // DB 조회 실패 시 메모리 기반으로만 제한 (fail-open)
  }

  return true;
}

/**
 * AI 호출 기록
 *
 * - 메모리: 쿨다운 시각, 시간당 카운터
 * - DB: 일일 카운터, 비용
 */
export async function recordLLMCall(market: Market, estimatedCostUsd = 0.0) {
  // 1. 메모리 업데이트
  const s = state[market];
  if (s) {
    s.lastCallAt = now();
    s.hourlyCount += 1;
  }

  // 2. DB 업데이트
  try {
    await recordAICall({
      date: today(),
      market,
      estimatedCostUsd,
    });
  } catch (error) {
    console.error('[AI Budget] DB 기록 실패', error);
    // DB 기록 실패해도 계속 진행 (비용 추적 누락되지만 서비스는 중단되지 않음)
  }
}
