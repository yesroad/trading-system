import Big from 'big.js';
import { getSupabase } from '@workspace/db-client';
import { DateTime } from 'luxon';
import { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import { env } from '../config/env.js';
import type { Snapshot } from './collectSnapshot.js';

type TargetLike = { symbol: string } | string;

type GateResult = {
  ok: boolean;
  reason: string;
};

type CandlePoint = {
  time: DateTime;
  close: Big;
  volume: Big | null;
};

type PricePoint = {
  time: DateTime;
  price: Big;
};

function toDateTime(value: unknown): DateTime | null {
  if (typeof value !== 'string') return null;
  const dt = DateTime.fromISO(value, { setZone: true });
  return dt.isValid ? dt : null;
}

function toBig(value: unknown): Big | null {
  if (typeof value === 'number' && Number.isFinite(value)) return new Big(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return new Big(value);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeSymbols(targets: TargetLike[]): string[] {
  const out: string[] = [];

  for (const t of targets) {
    const symbol = typeof t === 'string' ? t : t?.symbol;
    if (typeof symbol === 'string' && symbol.trim().length > 0) {
      out.push(symbol.trim());
    }
  }

  return Array.from(new Set(out));
}

function isNearIntervalBoundary(nowUtc: DateTime): boolean {
  const interval = Math.max(1, env.AI_CALL_INTERVAL_MINUTES);
  const tolerance = Math.max(0, env.AI_GATE_TIME_TOLERANCE_MIN);
  const minute = nowUtc.minute;
  const mod = minute % interval;
  return mod <= tolerance || interval - mod <= tolerance;
}

function intersectsInterval(params: {
  base: DateTime;
  lookaheadMinutes: number;
  windowStartMinutes: number;
  windowEndMinutes: number;
}): boolean {
  const { base, lookaheadMinutes, windowStartMinutes, windowEndMinutes } = params;
  const start = base;
  const end = base.plus({ minutes: lookaheadMinutes });
  const dayStart = base.startOf('day');
  const windowStart = dayStart.plus({ minutes: windowStartMinutes });
  const windowEnd = dayStart.plus({ minutes: windowEndMinutes });

  return start.toMillis() < windowEnd.toMillis() && end.toMillis() > windowStart.toMillis();
}

function aggregateOneMinuteToFiveMinute(points: CandlePoint[]): CandlePoint[] {
  const bucketSizeMs = 5 * 60 * 1000;
  const buckets = new Map<number, CandlePoint>();

  const sorted = [...points].sort((a, b) => a.time.toMillis() - b.time.toMillis());

  for (const point of sorted) {
    const bucketMs = Math.floor(point.time.toUTC().toMillis() / bucketSizeMs) * bucketSizeMs;
    const existing = buckets.get(bucketMs);

    if (!existing) {
      buckets.set(bucketMs, {
        time: DateTime.fromMillis(bucketMs, { zone: 'utc' }),
        close: point.close,
        volume: point.volume,
      });
      continue;
    }

    existing.close = point.close;
    if (existing.volume !== null && point.volume !== null) {
      existing.volume = existing.volume.plus(point.volume);
    } else {
      existing.volume = null;
    }
  }

  return [...buckets.values()].sort((a, b) => a.time.toMillis() - b.time.toMillis());
}

function computeReturnPct(current: Big, previous: Big): Big | null {
  if (previous.eq(0)) return null;
  return current.minus(previous).div(previous).abs().times(100);
}

function computeFiveMinuteMetrics(bars: CandlePoint[]): {
  returnPct: Big;
  volumeRatio: Big | null;
} | null {
  if (bars.length < 13) return null;

  const latest = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const returnPct = computeReturnPct(latest.close, prev.close);
  if (returnPct === null) return null;

  const previousVolumes = bars.slice(-13, -1).map((b) => b.volume);
  let volumeRatio: Big | null = null;

  if (latest.volume !== null && previousVolumes.every((v): v is Big => v !== null)) {
    const avg = previousVolumes
      .reduce((sum, v) => sum.plus(v), new Big(0))
      .div(previousVolumes.length);
    if (avg.gt(0)) {
      volumeRatio = latest.volume.div(avg);
    }
  }

  return { returnPct, volumeRatio };
}

function computeTickReturnPct(points: PricePoint[]): Big | null {
  if (points.length < 2) return null;
  const latest = points[points.length - 1];
  const baseTime = latest.time.minus({ minutes: 5 }).toMillis();

  let reference: PricePoint | null = null;
  for (let i = points.length - 2; i >= 0; i -= 1) {
    if (points[i].time.toMillis() <= baseTime) {
      reference = points[i];
      break;
    }
  }

  if (!reference) return null;
  return computeReturnPct(latest.price, reference.price);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);

  if (low === high) return sorted[low];
  const weight = rank - low;
  return sorted[low] * (1 - weight) + sorted[high] * weight;
}

function parseRowsToCandlePoints(
  rows: unknown[],
  columns: { time: string; close: string; volume?: string },
): CandlePoint[] {
  const points: CandlePoint[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;

    const time = toDateTime(record[columns.time]);
    const close = toBig(record[columns.close]);
    if (!time || !close) continue;

    const volume = columns.volume ? toBig(record[columns.volume]) : null;
    points.push({ time, close, volume });
  }

  return points.sort((a, b) => a.time.toMillis() - b.time.toMillis());
}

async function fetchUpbitFiveMinuteBars(symbol: string): Promise<CandlePoint[]> {
  const supabase = getSupabase();
  const market = symbol.startsWith('KRW-') ? symbol : `KRW-${symbol}`;

  const fiveMinute = await supabase
    .from('upbit_candles')
    .select('candle_time_utc,close,volume')
    .eq('market', market)
    .eq('timeframe', '5m')
    .order('candle_time_utc', { ascending: false })
    .limit(20);

  if (!fiveMinute.error && Array.isArray(fiveMinute.data) && fiveMinute.data.length >= 13) {
    return parseRowsToCandlePoints(fiveMinute.data, {
      time: 'candle_time_utc',
      close: 'close',
      volume: 'volume',
    });
  }

  const oneMinute = await supabase
    .from('upbit_candles')
    .select('candle_time_utc,close,volume')
    .eq('market', market)
    .eq('timeframe', '1m')
    .order('candle_time_utc', { ascending: false })
    .limit(120);

  if (oneMinute.error || !Array.isArray(oneMinute.data) || oneMinute.data.length === 0) return [];

  const minutePoints = parseRowsToCandlePoints(oneMinute.data, {
    time: 'candle_time_utc',
    close: 'close',
    volume: 'volume',
  });
  return aggregateOneMinuteToFiveMinute(minutePoints);
}

async function fetchKrxFiveMinuteBars(symbol: string): Promise<CandlePoint[]> {
  const supabase = getSupabase();

  const fiveMinute = await supabase
    .from('kis_candles')
    .select('candle_time,close,volume')
    .eq('symbol', symbol)
    .eq('timeframe', '5m')
    .order('candle_time', { ascending: false })
    .limit(20);

  if (!fiveMinute.error && Array.isArray(fiveMinute.data) && fiveMinute.data.length >= 13) {
    return parseRowsToCandlePoints(fiveMinute.data, {
      time: 'candle_time',
      close: 'close',
      volume: 'volume',
    });
  }

  const oneMinute = await supabase
    .from('kis_candles')
    .select('candle_time,close,volume')
    .eq('symbol', symbol)
    .eq('timeframe', '1m')
    .order('candle_time', { ascending: false })
    .limit(120);

  if (oneMinute.error || !Array.isArray(oneMinute.data) || oneMinute.data.length === 0) return [];

  const minutePoints = parseRowsToCandlePoints(oneMinute.data, {
    time: 'candle_time',
    close: 'close',
    volume: 'volume',
  });

  return aggregateOneMinuteToFiveMinute(minutePoints);
}

async function fetchKrxTickPoints(symbol: string): Promise<PricePoint[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('kis_price_ticks')
    .select('ts,price')
    .eq('symbol', symbol)
    .order('ts', { ascending: false })
    .limit(400);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  const points: PricePoint[] = [];
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const time = toDateTime(record.ts);
    const price = toBig(record.price);
    if (!time || !price) continue;
    points.push({ time, price });
  }

  return points.sort((a, b) => a.time.toMillis() - b.time.toMillis());
}

async function fetchUsBars(symbol: string): Promise<CandlePoint[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('equity_bars')
    .select('ts,close,volume')
    .eq('symbol', symbol)
    .eq('timeframe', '15m')
    .order('ts', { ascending: false })
    .limit(140);

  if (error || !Array.isArray(data) || data.length === 0) return [];

  return parseRowsToCandlePoints(data, {
    time: 'ts',
    close: 'close',
    volume: 'volume',
  });
}

async function evaluateCryptoVolatility(symbols: string[]): Promise<GateResult> {
  for (const symbol of symbols) {
    const bars = await fetchUpbitFiveMinuteBars(symbol);
    const metrics = computeFiveMinuteMetrics(bars);
    if (!metrics) continue;

    if (metrics.returnPct.gte(env.AI_CRYPTO_RETURN_5M_PCT)) {
      return {
        ok: true,
        reason: `return_5m=${metrics.returnPct.toFixed(3)}% (symbol=${symbol})`,
      };
    }

    if (metrics.volumeRatio !== null && metrics.volumeRatio.gte(env.AI_CRYPTO_VOLUME_SPIKE_X)) {
      return {
        ok: true,
        reason: `volume_ratio=${metrics.volumeRatio.toFixed(3)}x (symbol=${symbol})`,
      };
    }
  }

  return { ok: false, reason: 'CRYPTO 변동성 조건 미충족' };
}

async function evaluateKrxEvent(symbols: string[]): Promise<GateResult> {
  const nowKst = DateTime.now().setZone('Asia/Seoul');
  const timingTriggered =
    intersectsInterval({
      base: nowKst,
      lookaheadMinutes: env.AI_CALL_INTERVAL_MINUTES,
      windowStartMinutes: 9 * 60 + 10,
      windowEndMinutes: 9 * 60 + 20,
    }) ||
    intersectsInterval({
      base: nowKst,
      lookaheadMinutes: env.AI_CALL_INTERVAL_MINUTES,
      windowStartMinutes: 15 * 60 + 10,
      windowEndMinutes: 15 * 60 + 20,
    });

  if (timingTriggered) {
    return { ok: true, reason: '장 시작/마감 근처 타이밍 트리거' };
  }

  for (const symbol of symbols) {
    const bars = await fetchKrxFiveMinuteBars(symbol);
    const metrics = computeFiveMinuteMetrics(bars);

    if (metrics) {
      if (metrics.returnPct.gte(env.AI_KRX_RETURN_5M_PCT)) {
        return {
          ok: true,
          reason: `return_5m=${metrics.returnPct.toFixed(3)}% (symbol=${symbol})`,
        };
      }

      if (metrics.volumeRatio !== null && metrics.volumeRatio.gte(env.AI_KRX_VOLUME_SPIKE_X)) {
        return {
          ok: true,
          reason: `volume_ratio=${metrics.volumeRatio.toFixed(3)}x (symbol=${symbol})`,
        };
      }
    }

    const tickPoints = await fetchKrxTickPoints(symbol);
    const tickReturnPct = computeTickReturnPct(tickPoints);
    if (tickReturnPct !== null && tickReturnPct.gte(env.AI_KRX_RETURN_5M_PCT)) {
      return {
        ok: true,
        reason: `tick_return_5m=${tickReturnPct.toFixed(3)}% (symbol=${symbol})`,
      };
    }
  }

  return { ok: false, reason: 'KRX 강한 이벤트 조건 미충족' };
}

function isUsRegularSessionMode(mode: MarketMode): boolean {
  return mode === 'INTRADAY' || mode === 'CLOSE';
}

function isUsCloseMinusThirty(nowNy: DateTime): boolean {
  const closeMinusThirty = nowNy
    .startOf('day')
    .set({ hour: 15, minute: 30, second: 0, millisecond: 0 });
  const diffMin = Math.abs(nowNy.diff(closeMinusThirty, 'minutes').minutes);
  return diffMin <= env.AI_GATE_TIME_TOLERANCE_MIN;
}

async function evaluateUsEvent(params: {
  mode: MarketMode;
  symbols: string[];
  snapshot: Snapshot;
}): Promise<GateResult> {
  if (!isUsRegularSessionMode(params.mode)) {
    return { ok: false, reason: 'US 정규장 모드가 아님(프리/애프터 제외)' };
  }

  const nowNy = DateTime.now().setZone('America/New_York');
  if (isUsCloseMinusThirty(nowNy)) {
    return { ok: true, reason: '미장 마감 30분 전 강제 실행' };
  }

  const lastAiAt = toDateTime(params.snapshot.ai.latestCreatedAt);
  if (!lastAiAt) {
    return { ok: true, reason: 'US 최초 실행(heartbeat)' };
  }

  const elapsedMin = DateTime.now().toUTC().diff(lastAiAt.toUTC(), 'minutes').minutes;
  if (elapsedMin >= env.AI_US_HEARTBEAT_HOURS * 60) {
    return {
      ok: true,
      reason: `US heartbeat ${env.AI_US_HEARTBEAT_HOURS}h 경과`,
    };
  }

  for (const symbol of params.symbols) {
    const bars = await fetchUsBars(symbol);
    if (bars.length < 4) continue;

    const latest = bars[bars.length - 1];
    const prev15 = bars[bars.length - 2];
    const prev30 = bars[bars.length - 3];

    const return15m = computeReturnPct(latest.close, prev15.close);
    if (return15m !== null && return15m.gte(env.AI_US_RETURN_15M_PCT)) {
      return {
        ok: true,
        reason: `return_15m=${return15m.toFixed(3)}% (symbol=${symbol})`,
      };
    }

    const previousVolumes = bars
      .slice(-97, -1)
      .map((b) => b.volume)
      .filter((v): v is Big => v !== null);
    if (latest.volume !== null && previousVolumes.length >= 12) {
      const avgVolume = previousVolumes
        .reduce((sum, v) => sum.plus(v), new Big(0))
        .div(previousVolumes.length);
      if (avgVolume.gt(0)) {
        const volumeRatio = latest.volume.div(avgVolume);
        if (volumeRatio.gte(env.AI_US_VOLUME_SPIKE_X)) {
          return {
            ok: true,
            reason: `volume_ratio_15m=${volumeRatio.toFixed(3)}x (symbol=${symbol})`,
          };
        }
      }
    }

    const recent30mVol = computeReturnPct(latest.close, prev30.close);
    if (!recent30mVol) continue;

    const scoped = bars.slice(-98);
    const historicalVols: number[] = [];
    for (let i = 2; i < scoped.length; i += 1) {
      const v = computeReturnPct(scoped[i].close, scoped[i - 2].close);
      if (v) historicalVols.push(v.toNumber());
    }

    const percentileRank = 100 - env.AI_US_VOLATILITY_TOP_PERCENT;
    const threshold = percentile(historicalVols, percentileRank);
    if (threshold !== null && recent30mVol.gte(threshold)) {
      return {
        ok: true,
        reason: `vol_30m=${recent30mVol.toFixed(3)}% >= p${Math.round(percentileRank)} (symbol=${symbol})`,
      };
    }
  }

  return { ok: false, reason: 'US 추가 호출 조건 미충족' };
}

export async function shouldCallByMarketEventGate(params: {
  market: Market;
  mode: MarketMode;
  targets: TargetLike[];
  snapshot: Snapshot;
}): Promise<GateResult> {
  const symbols = normalizeSymbols(params.targets).slice(0, env.AI_GATE_TARGET_SCAN_LIMIT);

  if (symbols.length === 0) {
    return { ok: false, reason: '평가 대상 심볼 없음' };
  }

  if (params.market === Market.CRYPTO) {
    const nowUtc = DateTime.now().toUTC();
    if (!isNearIntervalBoundary(nowUtc)) {
      return { ok: false, reason: 'CRYPTO 시간 게이트 미충족' };
    }
    return evaluateCryptoVolatility(symbols);
  }

  if (params.market === Market.KRX) {
    return evaluateKrxEvent(symbols);
  }

  return evaluateUsEvent({
    mode: params.mode,
    symbols,
    snapshot: params.snapshot,
  });
}
