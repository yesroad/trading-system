import Big from 'big.js';
import { DateTime } from 'luxon';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeUtcIso, toIsoString, type Nullable } from '@workspace/shared-utils';
import { envServer } from '@/lib/env.server';
import type {
  MarketHealth,
  MarketCode,
  MarketPortfolioSummary,
  OpsSnapshot,
  PerformanceMetrics,
  SnapshotPerformance,
  SnapshotPosition,
} from '@/types/api/snapshot';

export const runtime = 'nodejs';

type DbPositionRow = {
  broker: string | null;
  market: string | null;
  symbol: string | null;
  qty: number | string | null;
  avg_price: number | string | null;
  updated_at: string | null;
};

type DbTradeExecutionRow = {
  broker: string | null;
  symbol: string | null;
  side: string | null;
  status: string | null;
  quantity: number | string | null;
  price: number | string | null;
  executed_qty: number | string | null;
  executed_price: number | string | null;
  metadata: unknown;
  created_at: string | null;
};

type DbDailyStatsRow = {
  date: string | null;
  total_trades: number | string | null;
  successful_trades: number | string | null;
  failed_trades: number | string | null;
  total_buy_amount: number | string | null;
  total_sell_amount: number | string | null;
};

type DbKisPriceRow = {
  symbol: string | null;
  price: number | string | null;
  ts: string | null;
};

type DbUpbitPriceRow = {
  market: string | null;
  close: number | string | null;
  candle_time_utc: string | null;
};

type DbUsPriceRow = {
  symbol: string | null;
  close: number | string | null;
  ts: string | null;
};

type DbWorkerStatusRow = {
  service: string | null;
  state: string | null;
  last_event_at: string | null;
};

type PriceEntry = {
  price: Big;
  updatedAtUtc: string;
};

type PnlState = {
  qty: Big;
  cost: Big;
  realized: Big;
};

type CacheEntry = {
  expiresAtMs: number;
  body: OpsSnapshot;
};

const CACHE_TTL_MS = 8_000;
const HEALTH_STALE_MINUTES = 30;
const MARKET_CODES: MarketCode[] = ['CRYPTO', 'KR', 'US'];
const MARKET_SERVICE_MAP: Record<MarketCode, string> = {
  CRYPTO: 'upbit-collector',
  KR: 'kis-collector',
  US: 'yf-collector',
};

let cacheEntry: CacheEntry | null = null;
let supabase: ReturnType<typeof createClient> | null = null;

function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(envServer('SUPABASE_URL'), envServer('SUPABASE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

function asBigOrZero(value: number | string | null | undefined): Big {
  if (value === null || value === undefined) return new Big(0);
  try {
    return new Big(value);
  } catch {
    return new Big(0);
  }
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

function normalizeMarket(raw: string | null | undefined): MarketCode | null {
  const key = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (key === 'CRYPTO' || key === 'COIN') return 'CRYPTO';
  if (key === 'KR' || key === 'KRX' || key === 'KOREA') return 'KR';
  if (key === 'US' || key === 'USA' || key === 'NYSE' || key === 'NASDAQ') return 'US';
  return null;
}

function normalizeSymbol(raw: string | null | undefined): string {
  return String(raw ?? '')
    .trim()
    .toUpperCase();
}

function normalizeKrSymbol(raw: string): string {
  const symbol = normalizeSymbol(raw);
  return symbol.startsWith('KRX:') ? symbol : `KRX:${symbol}`;
}

function normalizeCryptoSymbol(raw: string): string {
  const symbol = normalizeSymbol(raw);
  if (symbol.startsWith('KRW-')) return symbol.slice(4);
  return symbol;
}

function parseMarketFromExecution(row: DbTradeExecutionRow): MarketCode | null {
  const metadata =
    row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : null;
  const metadataMarket = typeof metadata?.market === 'string' ? metadata.market : null;
  const direct = normalizeMarket(metadataMarket);
  if (direct) return direct;

  const symbol = normalizeSymbol(row.symbol);
  if (symbol.startsWith('KRW-')) return 'CRYPTO';
  if (symbol.startsWith('KRX:') || /^\d{6}$/.test(symbol)) return 'KR';
  if (symbol.length > 0) return 'US';

  return null;
}

function isFilledExecution(row: DbTradeExecutionRow): boolean {
  const executedQty = asBigOrZero(row.executed_qty);
  if (executedQty.gt(0)) return true;

  const status = normalizeSymbol(row.status);
  if (!status) return false;

  return (
    status === 'FILLED' ||
    status === 'DONE' ||
    status === 'EXECUTED' ||
    status === 'SUCCESS' ||
    status === 'COMPLETED'
  );
}

function parseExecutionSide(raw: string | null | undefined): 'BUY' | 'SELL' | null {
  const side = normalizeSymbol(raw);
  if (side === 'BUY' || side === 'B') return 'BUY';
  if (side === 'SELL' || side === 'S') return 'SELL';
  return null;
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

function withChunk<T>(items: T[], size = 100): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function fetchLatestKisPrices(client: ReturnType<typeof createClient>, symbols: string[]) {
  const table = new Map<string, PriceEntry>();
  const normalized = Array.from(new Set(symbols.map((symbol) => normalizeKrSymbol(symbol))));

  for (const chunk of withChunk(normalized)) {
    const res = await client
      .from('kis_price_ticks')
      .select('symbol,price,ts')
      .in('symbol', chunk)
      .limit(5000);
    if (res.error) throw new Error(`kis_price_ticks 조회 실패: ${res.error.message}`);

    ((res.data ?? []) as DbKisPriceRow[]).forEach((row) => {
      const symbol = normalizeSymbol(row.symbol);
      const ts = String(row.ts ?? '');
      if (!symbol || !ts) return;

      const price = asBigOrZero(row.price);
      if (price.lte(0)) return;

      const prev = table.get(symbol);
      const prevMs = toUtcMillis(prev?.updatedAtUtc ?? null) ?? -1;
      const curMs = toUtcMillis(ts) ?? -1;
      if (curMs < prevMs) return;

      table.set(symbol, { price, updatedAtUtc: ts });
    });
  }

  return table;
}

async function fetchLatestUpbitPrices(client: ReturnType<typeof createClient>, symbols: string[]) {
  const table = new Map<string, PriceEntry>();
  const markets = Array.from(
    new Set(
      symbols.map((symbol) => {
        const normalized = normalizeSymbol(symbol);
        return normalized.startsWith('KRW-')
          ? normalized
          : `KRW-${normalizeCryptoSymbol(normalized)}`;
      }),
    ),
  );

  for (const chunk of withChunk(markets)) {
    const res = await client
      .from('upbit_candles')
      .select('market,close,candle_time_utc')
      .in('market', chunk)
      .limit(5000);
    if (res.error) throw new Error(`upbit_candles 조회 실패: ${res.error.message}`);

    ((res.data ?? []) as DbUpbitPriceRow[]).forEach((row) => {
      const market = normalizeSymbol(row.market);
      const ts = String(row.candle_time_utc ?? '');
      if (!market || !ts) return;

      const price = asBigOrZero(row.close);
      if (price.lte(0)) return;

      const prev = table.get(market);
      const prevMs = toUtcMillis(prev?.updatedAtUtc ?? null) ?? -1;
      const curMs = toUtcMillis(ts) ?? -1;
      if (curMs < prevMs) return;

      table.set(market, { price, updatedAtUtc: ts });
      table.set(normalizeCryptoSymbol(market), { price, updatedAtUtc: ts });
    });
  }

  return table;
}

async function fetchLatestUsPrices(client: ReturnType<typeof createClient>, symbols: string[]) {
  const table = new Map<string, PriceEntry>();
  const normalized = Array.from(
    new Set(symbols.map((symbol) => normalizeSymbol(symbol)).filter(Boolean)),
  );

  for (const chunk of withChunk(normalized)) {
    const res = await client
      .from('equity_bars')
      .select('symbol,close,ts')
      .in('symbol', chunk)
      .limit(5000);
    if (res.error) throw new Error(`equity_bars 조회 실패: ${res.error.message}`);

    ((res.data ?? []) as DbUsPriceRow[]).forEach((row) => {
      const symbol = normalizeSymbol(row.symbol);
      const ts = String(row.ts ?? '');
      if (!symbol || !ts) return;

      const price = asBigOrZero(row.close);
      if (price.lte(0)) return;

      const prev = table.get(symbol);
      const prevMs = toUtcMillis(prev?.updatedAtUtc ?? null) ?? -1;
      const curMs = toUtcMillis(ts) ?? -1;
      if (curMs < prevMs) return;

      table.set(symbol, { price, updatedAtUtc: ts });
    });
  }

  return table;
}

function buildPositionKey(broker: string, market: MarketCode, symbol: string): string {
  return `${broker}|${market}|${symbol}`;
}

function formatMoney(value: Big): string {
  return value.toFixed(2);
}

function isHealthyWorkerState(raw: string | null | undefined): boolean {
  const state = normalizeSymbol(raw);
  return state === 'RUNNING' || state === 'SUCCESS' || state === 'SKIPPED';
}

function buildMarketHealth(rows: DbWorkerStatusRow[]): Record<MarketCode, MarketHealth> {
  const now = DateTime.utc();
  const out = {} as Record<MarketCode, MarketHealth>;
  const byService = new Map<string, DbWorkerStatusRow>();

  rows.forEach((row) => {
    const service = String(row.service ?? '').trim();
    if (!service) return;
    byService.set(service, row);
  });

  MARKET_CODES.forEach((market) => {
    const service = MARKET_SERVICE_MAP[market];
    const row = byService.get(service);
    const state = row?.state ?? null;
    const lastEventAtUtc = row?.last_event_at ?? null;

    if (!row) {
      out[market] = {
        market,
        service,
        state: null,
        lastEventAtUtc: null,
        healthy: false,
        reason: 'worker_status 없음',
      };
      return;
    }

    const hasHealthyState = isHealthyWorkerState(state);
    const eventTime = lastEventAtUtc
      ? DateTime.fromISO(normalizeUtcIso(lastEventAtUtc), { zone: 'utc' })
      : null;
    const isFresh =
      !!eventTime &&
      eventTime.isValid &&
      now.diff(eventTime, 'minutes').minutes <= HEALTH_STALE_MINUTES;
    const healthy = hasHealthyState && isFresh;

    out[market] = {
      market,
      service,
      state,
      lastEventAtUtc,
      healthy,
      reason: healthy
        ? '정상'
        : !hasHealthyState
          ? `state=${state ?? 'unknown'}`
          : `최근 이벤트 지연(>${HEALTH_STALE_MINUTES}m)`,
    };
  });

  return out;
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

    const [positionsRes, tradeExecutionsRes, dailyRes, workersRes] = await Promise.all([
      client.from('positions').select('broker,market,symbol,qty,avg_price,updated_at').gt('qty', 0),
      client
        .from('trade_executions')
        .select(
          'broker,symbol,side,status,quantity,price,executed_qty,executed_price,metadata,created_at',
        )
        .order('created_at', { ascending: true })
        .limit(5000),
      client
        .from('daily_trading_stats')
        .select(
          'date,total_trades,successful_trades,failed_trades,total_buy_amount,total_sell_amount',
        )
        .order('date', { ascending: false })
        .limit(180),
      client.from('worker_status').select('service,state,last_event_at').limit(200),
    ]);

    if (positionsRes.error) throw new Error(`positions 조회 실패: ${positionsRes.error.message}`);
    if (tradeExecutionsRes.error) {
      throw new Error(`trade_executions 조회 실패: ${tradeExecutionsRes.error.message}`);
    }
    if (dailyRes.error) throw new Error(`daily_trading_stats 조회 실패: ${dailyRes.error.message}`);
    if (workersRes.error) throw new Error(`worker_status 조회 실패: ${workersRes.error.message}`);

    const positionRows = (positionsRes.data ?? []) as DbPositionRow[];
    const executionRows = (tradeExecutionsRes.data ?? []) as DbTradeExecutionRow[];
    const dailyRows = ((dailyRes.data ?? []) as DbDailyStatsRow[]) ?? [];
    const workerRows = (workersRes.data ?? []) as DbWorkerStatusRow[];

    const symbolsByMarket: Record<MarketCode, Set<string>> = {
      CRYPTO: new Set<string>(),
      KR: new Set<string>(),
      US: new Set<string>(),
    };

    positionRows.forEach((row) => {
      const market = normalizeMarket(row.market);
      const symbol = normalizeSymbol(row.symbol);
      if (!market || !symbol) return;
      symbolsByMarket[market].add(symbol);
    });

    const [kisPrices, upbitPrices, usPrices] = await Promise.all([
      fetchLatestKisPrices(client, Array.from(symbolsByMarket.KR)),
      fetchLatestUpbitPrices(client, Array.from(symbolsByMarket.CRYPTO)),
      fetchLatestUsPrices(client, Array.from(symbolsByMarket.US)),
    ]);

    const pnlStateByKey = new Map<string, PnlState>();
    const cashByMarket: Record<MarketCode, Big> = {
      CRYPTO: new Big(0),
      KR: new Big(0),
      US: new Big(0),
    };

    executionRows.forEach((row) => {
      if (!isFilledExecution(row)) return;

      const market = parseMarketFromExecution(row);
      const side = parseExecutionSide(row.side);
      const symbol = normalizeSymbol(row.symbol);
      const broker = normalizeSymbol(row.broker) || 'UNKNOWN';
      if (!market || !side || !symbol) return;

      const qty = asBigOrZero(row.executed_qty).gt(0)
        ? asBigOrZero(row.executed_qty)
        : asBigOrZero(row.quantity);
      const price = asBigOrZero(row.executed_price).gt(0)
        ? asBigOrZero(row.executed_price)
        : asBigOrZero(row.price);
      if (qty.lte(0) || price.lte(0)) return;

      const key = buildPositionKey(broker, market, symbol);
      const state = pnlStateByKey.get(key) ?? {
        qty: new Big(0),
        cost: new Big(0),
        realized: new Big(0),
      };

      if (side === 'BUY') {
        state.qty = state.qty.plus(qty);
        state.cost = state.cost.plus(price.times(qty));
        cashByMarket[market] = cashByMarket[market].minus(price.times(qty));
      } else {
        const sellQty = state.qty.gt(0) ? (state.qty.lt(qty) ? state.qty : qty) : new Big(0);
        const avgCost = state.qty.gt(0) ? state.cost.div(state.qty) : price;
        const realized = price.minus(avgCost).times(sellQty);

        state.realized = state.realized.plus(realized);
        state.qty = state.qty.minus(sellQty);
        state.cost = state.cost.minus(avgCost.times(sellQty));
        cashByMarket[market] = cashByMarket[market].plus(price.times(qty));
      }

      pnlStateByKey.set(key, state);
    });

    const byMarketAccumulator: Record<MarketCode, Omit<MarketPortfolioSummary, 'weightPct'>> = {
      CRYPTO: {
        market: 'CRYPTO',
        asset: '0',
        invested: '0',
        cash: '0',
        realizedPnl: '0',
        unrealizedPnl: '0',
        pnl: '0',
        pnlRatePct: null,
        positionCount: 0,
      },
      KR: {
        market: 'KR',
        asset: '0',
        invested: '0',
        cash: '0',
        realizedPnl: '0',
        unrealizedPnl: '0',
        pnl: '0',
        pnlRatePct: null,
        positionCount: 0,
      },
      US: {
        market: 'US',
        asset: '0',
        invested: '0',
        cash: '0',
        realizedPnl: '0',
        unrealizedPnl: '0',
        pnl: '0',
        pnlRatePct: null,
        positionCount: 0,
      },
    };

    const positions: SnapshotPosition[] = [];

    positionRows.forEach((row) => {
      const market = normalizeMarket(row.market);
      const broker = normalizeSymbol(row.broker) || 'UNKNOWN';
      const symbol = normalizeSymbol(row.symbol);
      const qty = asBigOrZero(row.qty);
      const avgPrice = asBigOrZero(row.avg_price);
      if (!market || !symbol || qty.lte(0)) return;

      const key = buildPositionKey(broker, market, symbol);
      const realizedPnl = (pnlStateByKey.get(key)?.realized ?? new Big(0)).toFixed(2);

      const invested = qty.times(avgPrice);
      let priceEntry: PriceEntry | undefined;

      if (market === 'CRYPTO') {
        priceEntry =
          upbitPrices.get(symbol) ?? upbitPrices.get(`KRW-${normalizeCryptoSymbol(symbol)}`);
      } else if (market === 'KR') {
        priceEntry = kisPrices.get(symbol) ?? kisPrices.get(normalizeKrSymbol(symbol));
      } else {
        priceEntry = usPrices.get(symbol);
      }

      const currentPrice = priceEntry?.price ?? null;
      const marketValue = currentPrice ? qty.times(currentPrice) : null;
      const unrealizedPnl = marketValue ? marketValue.minus(invested) : null;
      const pnl = unrealizedPnl
        ? unrealizedPnl.plus(asBigOrZero(realizedPnl))
        : asBigOrZero(realizedPnl);
      const pnlRatePct = invested.gt(0) ? pnl.div(invested).times(100).toFixed(2) : null;

      positions.push({
        id: key,
        broker,
        market,
        symbol,
        qty: qty.toFixed(8),
        avgPrice: avgPrice.gt(0) ? avgPrice.toFixed(8) : null,
        currentPrice: currentPrice ? currentPrice.toFixed(8) : null,
        invested: invested.toFixed(2),
        marketValue: marketValue ? marketValue.toFixed(2) : null,
        realizedPnl,
        unrealizedPnl: unrealizedPnl ? unrealizedPnl.toFixed(2) : null,
        pnl: pnl.toFixed(2),
        pnlRatePct,
        updatedAtUtc: row.updated_at,
        priceUpdatedAtUtc: priceEntry?.updatedAtUtc ?? null,
      });

      const target = byMarketAccumulator[market];
      const asset = asBigOrZero(target.asset).plus(marketValue ?? invested);
      const marketRealized = asBigOrZero(target.realizedPnl).plus(asBigOrZero(realizedPnl));
      const marketUnrealized = asBigOrZero(target.unrealizedPnl).plus(unrealizedPnl ?? new Big(0));
      const marketInvested = asBigOrZero(target.invested).plus(invested);
      const marketCash = cashByMarket[market];
      const marketPnl = marketRealized.plus(marketUnrealized);

      target.asset = asset.plus(marketCash).toFixed(2);
      target.invested = marketInvested.toFixed(2);
      target.cash = marketCash.toFixed(2);
      target.realizedPnl = marketRealized.toFixed(2);
      target.unrealizedPnl = marketUnrealized.toFixed(2);
      target.pnl = marketPnl.toFixed(2);
      target.pnlRatePct = marketInvested.gt(0)
        ? marketPnl.div(marketInvested).times(100).toFixed(2)
        : null;
      target.positionCount += 1;
    });

    positions.sort((a, b) => {
      const aPnl = asBigOrZero(a.pnl);
      const bPnl = asBigOrZero(b.pnl);
      if (aPnl.eq(bPnl)) return a.symbol.localeCompare(b.symbol);
      return bPnl.gt(aPnl) ? 1 : -1;
    });

    const totalAsset = MARKET_CODES.reduce(
      (acc, market) => acc.plus(asBigOrZero(byMarketAccumulator[market].asset)),
      new Big(0),
    );
    const totalInvested = MARKET_CODES.reduce(
      (acc, market) => acc.plus(asBigOrZero(byMarketAccumulator[market].invested)),
      new Big(0),
    );
    const totalCash = MARKET_CODES.reduce(
      (acc, market) => acc.plus(asBigOrZero(byMarketAccumulator[market].cash)),
      new Big(0),
    );
    const totalRealized = MARKET_CODES.reduce(
      (acc, market) => acc.plus(asBigOrZero(byMarketAccumulator[market].realizedPnl)),
      new Big(0),
    );
    const totalUnrealized = MARKET_CODES.reduce(
      (acc, market) => acc.plus(asBigOrZero(byMarketAccumulator[market].unrealizedPnl)),
      new Big(0),
    );
    const totalPnl = totalRealized.plus(totalUnrealized);

    const byMarket = {} as Record<MarketCode, MarketPortfolioSummary>;
    MARKET_CODES.forEach((market) => {
      const value = byMarketAccumulator[market];
      const weightPct = totalAsset.gt(0)
        ? asBigOrZero(value.asset).div(totalAsset).times(100).toFixed(2)
        : '0.00';

      byMarket[market] = {
        ...value,
        weightPct,
      };
    });
    const marketHealth = buildMarketHealth(workerRows);

    const body: OpsSnapshot = {
      meta: {
        generatedAtUtc: nowUtcIso(),
        force,
        ttlSeconds: Math.floor(CACHE_TTL_MS / 1000),
        cacheHit: false,
      },
      updatedAt: nowUtcIso(),
      total: {
        asset: formatMoney(totalAsset),
        invested: formatMoney(totalInvested),
        cash: formatMoney(totalCash),
        realizedPnl: formatMoney(totalRealized),
        unrealizedPnl: formatMoney(totalUnrealized),
        pnl: formatMoney(totalPnl),
        pnlRatePct: totalInvested.gt(0) ? totalPnl.div(totalInvested).times(100).toFixed(2) : null,
        positionCount: positions.length,
      },
      byMarket,
      marketHealth,
      positions,
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
