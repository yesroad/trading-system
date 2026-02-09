import Big from 'big.js';
import { DateTime } from 'luxon';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeUtcIso, toIsoString, type Nullable } from '@workspace/shared-utils';
import { envServer } from '@/lib/env.server';
import type {
  MarketCode,
  MarketDetail,
  MarketRiskCounts,
  MarketSummary,
  OpsSnapshot,
  PerformanceMetrics,
  SnapshotItem,
  SnapshotPerformance,
} from '@/types/api/snapshot';

export const runtime = 'nodejs';

type DbIngestionRunRow = {
  job: string | null;
  status: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type DbAiResultRow = {
  id: number;
  market: string | null;
  symbol: string | null;
  risk_level: string | null;
  confidence: number | string | null;
  summary: string | null;
  reasons: unknown;
  decision: string | null;
  created_at: string | null;
};

type DbPositionRow = {
  market: string | null;
  symbol: string | null;
  qty: number | string | null;
};

type DbDailyStatsRow = {
  date: string | null;
  total_trades: number | string | null;
  successful_trades: number | string | null;
  failed_trades: number | string | null;
  total_buy_amount: number | string | null;
  total_sell_amount: number | string | null;
};

type CacheEntry = {
  expiresAtMs: number;
  body: OpsSnapshot;
};

const CACHE_TTL_MS = 8_000;
let cacheEntry: CacheEntry | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

const MARKET_CODES: MarketCode[] = ['CRYPTO', 'KR', 'US'];

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(envServer('SUPABASE_URL'), envServer('SUPABASE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

function nowUtcIso(): string {
  return toIsoString(DateTime.utc());
}

function toUtcMillis(iso: Nullable<string>): Nullable<number> {
  if (!iso) return null;
  const parsed = DateTime.fromISO(normalizeUtcIso(iso), { zone: 'utc' });
  if (!parsed.isValid) return null;
  return parsed.toMillis();
}

function parseMarketCode(value: string | null | undefined): MarketCode | null {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'CRYPTO' || upper === 'KR' || upper === 'US') return upper;
  return null;
}

function parseRiskLevel(value: string | null | undefined): SnapshotItem['riskLevel'] {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'HIGH' || upper === 'MEDIUM' || upper === 'LOW') return upper;
  return 'UNKNOWN';
}

function parseDecision(value: string | null | undefined): SnapshotItem['decision'] {
  const upper = String(value ?? '').toUpperCase();
  if (upper === 'ALLOW' || upper === 'CAUTION' || upper === 'BLOCK') return upper;
  return 'UNKNOWN';
}

function asBigOrZero(value: number | string | null | undefined): Big {
  if (value === null || value === undefined) return new Big(0);
  try {
    return new Big(value);
  } catch {
    return new Big(0);
  }
}

function toLagMinutes(iso: Nullable<string>): Nullable<number> {
  const utcMs = toUtcMillis(iso);
  if (utcMs === null) return null;
  const lag = DateTime.utc().toMillis() - utcMs;
  return Math.max(0, Math.floor(lag / 60_000));
}

function mapIngestionJobToMarket(job: string | null): MarketCode | null {
  const normalized = String(job ?? '').toLowerCase();
  if (normalized.includes('upbit')) return 'CRYPTO';
  if (normalized.includes('kis')) return 'KR';
  if (normalized.includes('yf') || normalized.includes('yfinance')) return 'US';
  return null;
}

function summarizeReasons(reasons: unknown): string[] {
  if (!reasons) return [];

  if (typeof reasons === 'string') {
    return reasons.trim().length > 0 ? [reasons.trim()] : [];
  }

  if (Array.isArray(reasons)) {
    return reasons
      .map((v) => (typeof v === 'string' ? v.trim() : String(v)))
      .filter((v) => v.length > 0)
      .slice(0, 3);
  }

  if (typeof reasons === 'object') {
    const values = Object.values(reasons as Record<string, unknown>)
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter((v) => v.length > 0)
      .slice(0, 3);

    if (values.length > 0) return values;
  }

  return [];
}

function emptyRiskCounts(): MarketRiskCounts {
  return { HIGH: 0, MEDIUM: 0, LOW: 0 };
}

function buildStatus(
  ingestionLag: number | null,
  analysisLag: number | null,
): MarketSummary['status'] {
  const maxLag = Math.max(ingestionLag ?? 999, analysisLag ?? 999);
  if (maxLag >= 30) return 'down';
  if (maxLag >= 10) return 'warn';
  return 'ok';
}

function emptyPerformance(): SnapshotPerformance {
  const base: PerformanceMetrics = {
    totalTrades: 0,
    winTrades: 0,
    lossTrades: 0,
    pnlAmount: null,
    pnlRatePct: null,
  };

  return {
    DAILY: { ...base },
    WEEKLY: { ...base },
    MONTHLY: { ...base },
    ALL: { ...base },
  };
}

function computePerformance(rows: DbDailyStatsRow[]): SnapshotPerformance {
  const periods = emptyPerformance();
  const now = DateTime.utc();

  const periodFilter = {
    DAILY: (d: DateTime) => d >= now.minus({ days: 1 }),
    WEEKLY: (d: DateTime) => d >= now.minus({ days: 7 }),
    MONTHLY: (d: DateTime) => d >= now.minus({ months: 1 }),
    ALL: (_d: DateTime) => true,
  } as const;

  (Object.keys(periodFilter) as Array<keyof typeof periodFilter>).forEach((period) => {
    let totalTrades = 0;
    let winTrades = 0;
    let lossTrades = 0;
    let buyAmount = new Big(0);
    let sellAmount = new Big(0);

    rows.forEach((row) => {
      const date = row.date ? DateTime.fromISO(row.date, { zone: 'utc' }) : null;
      if (!date || !date.isValid) return;
      if (!periodFilter[period](date)) return;

      totalTrades += Number(asBigOrZero(row.total_trades).toString());
      winTrades += Number(asBigOrZero(row.successful_trades).toString());
      lossTrades += Number(asBigOrZero(row.failed_trades).toString());
      buyAmount = buyAmount.plus(asBigOrZero(row.total_buy_amount));
      sellAmount = sellAmount.plus(asBigOrZero(row.total_sell_amount));
    });

    const pnlAmount = sellAmount.minus(buyAmount);
    const pnlRatePct = buyAmount.gt(0) ? pnlAmount.div(buyAmount).times(100) : null;

    periods[period] = {
      totalTrades,
      winTrades,
      lossTrades,
      pnlAmount: pnlAmount.toFixed(2),
      pnlRatePct: pnlRatePct ? pnlRatePct.toFixed(2) : null,
    };
  });

  return periods;
}

export async function GET(req: Request) {
  const force = new URL(req.url).searchParams.get('force') === '1';
  const nowMs = DateTime.utc().toMillis();

  if (!force && cacheEntry && cacheEntry.expiresAtMs > nowMs) {
    return NextResponse.json({
      ...cacheEntry.body,
      meta: { ...cacheEntry.body.meta, cacheHit: true },
    });
  }

  try {
    const client = getSupabaseClient();

    const [ingestionRes, aiRes, positionsRes, dailyRes] = await Promise.all([
      client
        .from('ingestion_runs')
        .select('job,status,started_at,finished_at')
        .order('started_at', { ascending: false })
        .limit(300),
      client
        .from('ai_analysis_results')
        .select('id,market,symbol,risk_level,confidence,summary,reasons,decision,created_at')
        .order('created_at', { ascending: false })
        .limit(500),
      client.from('positions').select('market,symbol,qty').gt('qty', 0),
      client
        .from('daily_trading_stats')
        .select(
          'date,total_trades,successful_trades,failed_trades,total_buy_amount,total_sell_amount',
        )
        .order('date', { ascending: false })
        .limit(180),
    ]);

    if (ingestionRes.error)
      throw new Error(`ingestion_runs 조회 실패: ${ingestionRes.error.message}`);
    if (aiRes.error) throw new Error(`ai_analysis_results 조회 실패: ${aiRes.error.message}`);
    if (positionsRes.error) throw new Error(`positions 조회 실패: ${positionsRes.error.message}`);

    const ingestionRows = (ingestionRes.data ?? []) as DbIngestionRunRow[];
    const aiRows = (aiRes.data ?? []) as DbAiResultRow[];
    const positionRows = (positionsRes.data ?? []) as DbPositionRow[];
    const dailyRows = ((dailyRes.data ?? []) as DbDailyStatsRow[]) ?? [];

    const holdingsByMarketSet: Record<MarketCode, Set<string>> = {
      CRYPTO: new Set<string>(),
      KR: new Set<string>(),
      US: new Set<string>(),
    };

    positionRows.forEach((row) => {
      const market = parseMarketCode(row.market);
      const symbol = String(row.symbol ?? '').trim();
      const qty = asBigOrZero(row.qty);
      if (!market || !symbol || qty.lte(0)) return;
      holdingsByMarketSet[market].add(symbol);
    });

    const latestIngestionByMarket: Record<MarketCode, string | null> = {
      CRYPTO: null,
      KR: null,
      US: null,
    };

    ingestionRows.forEach((row) => {
      const market = mapIngestionJobToMarket(row.job);
      if (!market) return;
      const candidate = row.finished_at ?? row.started_at;
      if (!candidate) return;
      const current = latestIngestionByMarket[market];
      if (!current) {
        latestIngestionByMarket[market] = candidate;
        return;
      }
      const candidateMs = toUtcMillis(candidate);
      const currentMs = toUtcMillis(current);
      if (candidateMs !== null && currentMs !== null && candidateMs > currentMs) {
        latestIngestionByMarket[market] = candidate;
      }
    });

    const itemsByMarket: Record<MarketCode, SnapshotItem[]> = {
      CRYPTO: [],
      KR: [],
      US: [],
    };

    const riskByMarket: Record<MarketCode, MarketRiskCounts> = {
      CRYPTO: emptyRiskCounts(),
      KR: emptyRiskCounts(),
      US: emptyRiskCounts(),
    };

    const latestAiByMarket: Record<MarketCode, string | null> = {
      CRYPTO: null,
      KR: null,
      US: null,
    };

    aiRows.forEach((row) => {
      const market = parseMarketCode(row.market);
      const symbol = String(row.symbol ?? '').trim();
      const createdAtUtc = String(row.created_at ?? '').trim();
      if (!market || !symbol || !createdAtUtc) return;

      const riskLevel = parseRiskLevel(row.risk_level);
      if (riskLevel !== 'UNKNOWN') {
        riskByMarket[market][riskLevel] += 1;
      }

      const currentLatest = latestAiByMarket[market];
      if (!currentLatest) {
        latestAiByMarket[market] = createdAtUtc;
      } else {
        const createdMs = toUtcMillis(createdAtUtc);
        const currentMs = toUtcMillis(currentLatest);
        if (createdMs !== null && currentMs !== null && createdMs > currentMs) {
          latestAiByMarket[market] = createdAtUtc;
        }
      }

      const confidenceRaw = asBigOrZero(row.confidence);
      const confidencePct = confidenceRaw.lte(1) ? confidenceRaw.times(100) : confidenceRaw;

      itemsByMarket[market].push({
        id: row.id,
        symbol,
        riskLevel,
        confidence: confidencePct.toFixed(2),
        summary: String(row.summary ?? 'N/A'),
        reasons: summarizeReasons(row.reasons),
        decision: parseDecision(row.decision),
        createdAtUtc,
        isHolding: holdingsByMarketSet[market].has(symbol),
      });
    });

    MARKET_CODES.forEach((market) => {
      itemsByMarket[market].sort(
        (a, b) => (toUtcMillis(b.createdAtUtc) ?? 0) - (toUtcMillis(a.createdAtUtc) ?? 0),
      );
    });

    const markets = {} as Record<MarketCode, MarketSummary>;
    const tabs = {} as Record<MarketCode, MarketDetail>;

    MARKET_CODES.forEach((market) => {
      const latestIngestionAtUtc = latestIngestionByMarket[market];
      const latestAnalysisAtUtc = latestAiByMarket[market];
      const ingestionLagMinutes = toLagMinutes(latestIngestionAtUtc);
      const analysisLagMinutes = toLagMinutes(latestAnalysisAtUtc);

      markets[market] = {
        market,
        status: buildStatus(ingestionLagMinutes, analysisLagMinutes),
        latestIngestionAtUtc,
        latestAnalysisAtUtc,
        ingestionLagMinutes,
        analysisLagMinutes,
        riskCounts: riskByMarket[market],
      };

      tabs[market] = {
        market,
        targetCount: itemsByMarket[market].length,
        latestIngestionAtUtc,
        latestAnalysisAtUtc,
        ingestionLagMinutes,
        analysisLagMinutes,
        riskCounts: riskByMarket[market],
        items: itemsByMarket[market],
      };
    });

    const body: OpsSnapshot = {
      meta: {
        generatedAtUtc: nowUtcIso(),
        force,
        ttlSeconds: Math.floor(CACHE_TTL_MS / 1000),
        cacheHit: false,
      },
      markets,
      tabs,
      holdingsByMarket: {
        CRYPTO: Array.from(holdingsByMarketSet.CRYPTO),
        KR: Array.from(holdingsByMarketSet.KR),
        US: Array.from(holdingsByMarketSet.US),
      },
      performance: computePerformance(dailyRows),
    };

    cacheEntry = {
      expiresAtMs: nowMs + CACHE_TTL_MS,
      body,
    };

    return NextResponse.json(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'snapshot API unknown error';
    return NextResponse.json(
      {
        error: {
          code: 'SNAPSHOT_FETCH_FAILED',
          message,
        },
      },
      { status: 500 },
    );
  }
}
