import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import { diffMinutes, toKstDisplay } from '../utils/time.js';
import type { AlertEvent } from '../types/status.js';
import { env } from '../config/env.js';
import { fetchSystemGuardTradingEnabled, fetchWorkerStatusByService } from '../db/queries.js';

type SignalRow = {
  id: string | number;
  symbol: string;
  market: string;
  created_at: string;
  confidence: number;
};

type StaleSignalCandidate = {
  row: SignalRow;
  normalizedMarket: 'CRYPTO' | 'KRX' | 'US' | null;
  ageMinutes: number;
};

type StaleSignal = {
  row: SignalRow;
  normalizedMarket: 'CRYPTO' | 'KRX' | 'US';
  ageMinutes: number;
};

function isStaleSignal(value: StaleSignalCandidate): value is StaleSignal {
  return value.normalizedMarket !== null && value.ageMinutes >= 60;
}

function normalizeSignalMarket(raw: string): 'CRYPTO' | 'KRX' | 'US' | null {
  const normalized = raw.trim().toUpperCase();
  if (normalized === 'CRYPTO') return 'CRYPTO';
  if (normalized === 'KRX' || normalized === 'KR' || normalized === 'KIS') return 'KRX';
  if (normalized === 'US' || normalized === 'YF') return 'US';
  return null;
}

function canAlertForMarket(market: 'CRYPTO' | 'KRX' | 'US'): boolean {
  return env.EXECUTE_MARKETS.includes(market);
}

function isMarketOpen(market: 'CRYPTO' | 'KRX' | 'US'): boolean {
  if (env.MONITORING_RUN_MODE === 'NO_CHECK') return true;
  if (market === 'CRYPTO') return true;

  if (market === 'KRX') {
    const nowKst = DateTime.now().setZone('Asia/Seoul');
    if (nowKst.weekday >= 6) return false;

    const m = nowKst.hour * 60 + nowKst.minute;
    if (env.MONITORING_RUN_MODE === 'PREMARKET') return m >= 8 * 60 && m <= 9 * 60;
    if (env.MONITORING_RUN_MODE === 'AFTERMARKET') return m >= 15 * 60 + 30 && m <= 16 * 60;
    if (env.MONITORING_RUN_MODE === 'EXTENDED') return m >= 8 * 60 && m <= 16 * 60;
    return m >= 9 * 60 && m <= 15 * 60 + 30;
  }

  const nowNy = DateTime.now().setZone('America/New_York');
  if (nowNy.weekday >= 6) return false;

  const m = nowNy.hour * 60 + nowNy.minute;
  if (env.MONITORING_RUN_MODE === 'PREMARKET') return m >= 4 * 60 && m <= 9 * 60 + 30;
  if (env.MONITORING_RUN_MODE === 'AFTERMARKET') return m >= 16 * 60 && m <= 20 * 60;
  if (env.MONITORING_RUN_MODE === 'EXTENDED') return m >= 4 * 60 && m <= 20 * 60;
  return m >= 9 * 60 + 30 && m <= 16 * 60;
}

async function isTradeExecutorActive(now: string): Promise<boolean> {
  const row = await fetchWorkerStatusByService('trade-executor');
  if (!row) return false;

  const reference = row.last_success_at ?? row.last_event_at;
  if (!reference) return false;

  const lagMinutes = diffMinutes(reference, now);
  return lagMinutes <= env.WORKER_LAG_CRIT_MIN;
}

/**
 * trading_signals 테이블 체크
 *
 * CRIT 조건:
 * - 60분 이상 미소비 신호가 있음
 * - system_guard.trading_enabled=true
 * - trade-executor 최근 동작 기록 존재
 * - 해당 시장이 EXECUTE_MARKETS에 포함됨
 * - 해당 시장 장중임
 */
export async function checkTradingSignals(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();
  const now = nowIso();

  let tradingEnabled: boolean | null;
  try {
    tradingEnabled = await fetchSystemGuardTradingEnabled();
  } catch (error: unknown) {
    events.push({
      level: 'CRIT',
      category: 'trading_signals_error',
      title: 'system_guard 조회 실패',
      message: `system_guard 조회 중 에러: ${error instanceof Error ? error.message : String(error)}`,
      market: 'GLOBAL',
      at: now,
    });
    return events;
  }

  if (tradingEnabled !== true) return events;

  let tradeExecutorActive: boolean;
  try {
    tradeExecutorActive = await isTradeExecutorActive(now);
  } catch (error: unknown) {
    events.push({
      level: 'CRIT',
      category: 'trading_signals_error',
      title: 'trade-executor 상태 조회 실패',
      message: `worker_status 조회 중 에러: ${error instanceof Error ? error.message : String(error)}`,
      market: 'GLOBAL',
      at: now,
    });
    return events;
  }

  if (!tradeExecutorActive) return events;

  const { data: unconsumedSignals, error } = await supabase
    .from('trading_signals')
    .select('id, symbol, market, created_at, confidence')
    .is('consumed_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    events.push({
      level: 'CRIT',
      category: 'trading_signals_error',
      title: '신호 조회 실패',
      message: `trading_signals 조회 중 에러: ${error.message}`,
      market: 'GLOBAL',
      at: now,
    });
    return events;
  }

  if (!unconsumedSignals || unconsumedSignals.length === 0) {
    return events;
  }

  const rows = (unconsumedSignals as unknown[]).filter(
    (row): row is SignalRow =>
      typeof row === 'object' &&
      row !== null &&
      typeof (row as { symbol?: unknown }).symbol === 'string' &&
      typeof (row as { market?: unknown }).market === 'string' &&
      typeof (row as { created_at?: unknown }).created_at === 'string',
  );

  const stale = rows
    .map((row) => ({
      row,
      normalizedMarket: normalizeSignalMarket(row.market),
      ageMinutes: diffMinutes(row.created_at, now),
    }))
    .filter(isStaleSignal)
    .filter((item) => canAlertForMarket(item.normalizedMarket))
    .filter((item) => isMarketOpen(item.normalizedMarket));

  if (stale.length > 0) {
    const oldest = stale.sort((a, b) => b.ageMinutes - a.ageMinutes)[0];
    const targetMarket = oldest.normalizedMarket;
    const staleCount = stale.filter((x) => x.normalizedMarket === targetMarket).length;

    events.push({
      level: 'CRIT',
      category: 'trading_signals_stale',
      title: '신호 소비 지연 (심각)',
      message: [
        `시장: ${targetMarket}`,
        `미소비 신호(시장 기준): ${staleCount}개`,
        `가장 오래된 신호: ${oldest.row.symbol} (${toKstDisplay(oldest.row.created_at)} KST)`,
        `경과: ${oldest.ageMinutes.toFixed(1)}분`,
        '조건: trading_enabled=true + trade-executor active + EXECUTE_MARKETS 포함 + 장중',
      ].join('\n'),
      market: 'GLOBAL',
      at: now,
    });
  }

  return events;
}
