import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import { diffMinutes, toKstIso } from '../utils/time.js';
import type { AlertEvent } from '../types/status.js';
import { env } from '../config/env.js';

type SignalRow = {
  id: string | number;
  symbol: string;
  market: string;
  created_at: string;
  confidence: number;
};

type GuardRow = {
  trading_enabled?: unknown;
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
  if (normalized === 'KRX' || normalized === 'KR') return 'KRX';
  if (normalized === 'US') return 'US';
  return null;
}

function isTradingEnabled(row: GuardRow | null): boolean {
  if (!row) return false;
  if (row.trading_enabled === true) return true;
  return false;
}

function canAlertForMarket(market: 'CRYPTO' | 'KRX' | 'US'): boolean {
  return env.EXECUTE_MARKETS.includes(market);
}

/**
 * trading_signals 테이블 체크
 *
 * CRIT 조건:
 * - 60분 이상 미소비 신호가 있음
 * - system_guard.trading_enabled=true
 * - LOOP_MODE=true
 * - 해당 시장이 EXECUTE_MARKETS에 포함됨
 */
export async function checkTradingSignals(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const supabase = getSupabase();

  if (!env.LOOP_MODE) return events;

  const { data: guardData, error: guardError } = await supabase
    .from('system_guard')
    .select('trading_enabled')
    .eq('id', 1)
    .maybeSingle();

  if (guardError) {
    events.push({
      level: 'CRIT',
      category: 'trading_signals_error',
      title: 'system_guard 조회 실패',
      message: `system_guard 조회 중 에러: ${guardError.message}`,
      market: 'GLOBAL',
      at: nowIso(),
    });
    return events;
  }

  if (!isTradingEnabled((guardData ?? null) as GuardRow | null)) return events;

  // 미소비 신호 조회
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
      at: nowIso(),
    });
    return events;
  }

  if (!unconsumedSignals || unconsumedSignals.length === 0) {
    return events; // 미소비 신호 없음 - 정상
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
      ageMinutes: diffMinutes(row.created_at, nowIso()),
    }))
    .filter(isStaleSignal)
    .filter((item) => canAlertForMarket(item.normalizedMarket));

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
        `가장 오래된 신호: ${oldest.row.symbol} (${toKstIso(oldest.row.created_at)})`,
        `경과: ${oldest.ageMinutes.toFixed(1)}분`,
        '조건: trading_enabled=true + LOOP_MODE=true + EXECUTE_MARKETS 포함',
      ].join('\n'),
      market: 'GLOBAL',
      at: nowIso(),
    });
  }

  return events;
}
