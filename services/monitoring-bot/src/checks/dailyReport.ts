import Big from 'big.js';
import { DateTime } from 'luxon';
import {
  buildAIDailyBudgetPolicy,
  createBackoff,
  createLogger,
  isAIMarketDailyLimitReached,
  sleep,
  sumAIMarketUsage,
  type AIBudgetMarket,
  type Nullable,
} from '@workspace/shared-utils';
import { getDailyCallCount, getMonthlyAICost } from '@workspace/db-client';
import { env } from '../config/env.js';
import {
  buildPreviousKstDayWindow,
  fetchAceOutcomesInRange,
  fetchAiUsageBySymbolInRange,
  fetchAiDecisionCountsInRange,
  fetchCircuitBreakerCountInRange,
  fetchSignalCountsInRange,
  fetchSignalFailureReasonsInRange,
  fetchSymbolCatalogRows,
  fetchSystemGuardTradingEnabled,
  fetchTradesInRange,
  type AceOutcomeRow,
  type AiUsageBySymbolRow,
  type SignalFailureReasonRow,
  type SymbolCatalogRow,
  type TradeRow,
} from '../db/queries.js';
import { formatSignedNumber, marketLabel, toKstDisplay } from '../utils/time.js';

const logger = createLogger('monitoring-bot:daily-report');
const AI_MARKETS = ['CRYPTO', 'KRX', 'US'] as const;

type Currency = 'KRW' | 'USD';
type AIMarket = (typeof AI_MARKETS)[number];
type ParsedOutcome = {
  symbol: string;
  market: string;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  realizedPnL: Big;
};
type AIDailyUsage = {
  byMarket: Record<AIMarket, number>;
  effectiveLimitByMarket: Record<AIMarket, number>;
  total: number;
  effectiveDailyCap: number;
  baseDailyTotal: number;
  sharedPool: number;
  scaledDown: boolean;
  todayCallCap: number;
  reachedMarkets: AIMarket[];
};

function toBudgetMarket(market: AIMarket): AIBudgetMarket {
  if (market === 'CRYPTO') return 'CRYPTO';
  if (market === 'KRX') return 'KRX';
  return 'US';
}

function toBudgetUsage(usage: Record<AIMarket, number>): Record<AIBudgetMarket, number> {
  return {
    CRYPTO: usage.CRYPTO,
    KRX: usage.KRX,
    US: usage.US,
  };
}

function createEmptyAIDailyUsage(): AIDailyUsage {
  return {
    byMarket: {
      CRYPTO: 0,
      KRX: 0,
      US: 0,
    },
    effectiveLimitByMarket: {
      CRYPTO: 0,
      KRX: 0,
      US: 0,
    },
    total: 0,
    effectiveDailyCap: 0,
    baseDailyTotal: 0,
    sharedPool: 0,
    scaledDown: false,
    todayCallCap: 0,
    reachedMarkets: [],
  };
}

function asRecord(value: unknown): Nullable<Record<string, unknown>> {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): Nullable<number> {
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toBig(value: unknown): Big {
  const num = toNumber(value);
  if (num === null) return new Big(0);
  return new Big(num);
}

function normalizeMarketForLookup(
  raw: Nullable<string> | undefined,
): 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL' {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();

  if (value === 'KR' || value === 'KRX' || value === 'KIS') return 'KRX';
  if (value === 'US' || value === 'YF') return 'US';
  if (value === 'CRYPTO' || value === 'UPBIT') return 'CRYPTO';
  return 'GLOBAL';
}

function toCatalogKey(market: string, symbol: string): string {
  return `${market}:${symbol}`.toUpperCase();
}

function buildSymbolCatalogMap(rows: SymbolCatalogRow[]): Map<string, SymbolCatalogRow> {
  const out = new Map<string, SymbolCatalogRow>();

  for (const row of rows) {
    const market = normalizeMarketForLookup(row.market);
    if (market === 'GLOBAL') continue;
    const symbol = String(row.symbol ?? '').trim();
    if (!symbol) continue;

    out.set(toCatalogKey(market, symbol), row);

    if (market === 'KRX') {
      if (symbol.startsWith('KRX:')) out.set(toCatalogKey(market, symbol.slice(4)), row);
      else out.set(toCatalogKey(market, `KRX:${symbol}`), row);
    }
    if (market === 'US') {
      if (symbol.startsWith('US:')) out.set(toCatalogKey(market, symbol.slice(3)), row);
      else out.set(toCatalogKey(market, `US:${symbol}`), row);
    }
    if (market === 'CRYPTO') {
      const hyphen = symbol.indexOf('-');
      if (hyphen >= 0 && hyphen < symbol.length - 1) {
        out.set(toCatalogKey(market, symbol.slice(hyphen + 1)), row);
      }
    }
  }

  return out;
}

function lookupCatalogRow(
  map: Map<string, SymbolCatalogRow>,
  market: 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL',
  symbol: string,
): Nullable<SymbolCatalogRow> {
  if (market === 'GLOBAL') return null;
  const normalized = symbol.trim();
  if (!normalized) return null;

  const direct = map.get(toCatalogKey(market, normalized));
  if (direct) return direct;

  if (market === 'CRYPTO' && normalized.includes('-')) {
    const quoteRemoved = normalized.split('-')[1];
    if (quoteRemoved) {
      const coin = map.get(toCatalogKey(market, quoteRemoved));
      if (coin) return coin;
    }
  }

  return null;
}

function resolveSymbolDisplay(
  map: Map<string, SymbolCatalogRow>,
  marketRaw: string,
  symbol: string,
): string {
  const market = normalizeMarketForLookup(marketRaw);
  const row = lookupCatalogRow(map, market, symbol);
  if (!row) return symbol;

  const name =
    market === 'US'
      ? (row.name_en ?? row.name_ko ?? '').trim()
      : (row.name_ko ?? row.name_en ?? '').trim();

  if (!name || name === symbol) return symbol;
  return `${name} (${symbol})`;
}

function inferCurrency(marketRaw: string): Currency {
  const market = normalizeMarketForLookup(marketRaw);
  if (market === 'US') return 'USD';
  return 'KRW';
}

function formatCurrencyAmount(value: Big, currency: Currency): string {
  const num = Number(value.toString());
  const fractionDigits = currency === 'USD' ? 2 : 0;
  const base = Number.isFinite(num)
    ? formatSignedNumber(num, fractionDigits)
    : `${value.gt(0) ? '+' : value.lt(0) ? '-' : ''}${value.abs().toFixed(fractionDigits)}`;

  if (currency === 'USD') return `$${base}`;
  return `${base}원`;
}

function calcTradeCashflow(trade: TradeRow): Big {
  const qty = toBig(trade.qty);
  const price = toBig(trade.price);
  const fee = toBig(trade.fee_amount);
  const tax = toBig(trade.tax_amount);
  const amount = qty.times(price);
  const side = String(trade.side ?? '')
    .trim()
    .toUpperCase();

  if (side === 'BUY') return amount.plus(fee).plus(tax).times(-1);
  if (side === 'SELL') return amount.minus(fee).minus(tax);
  return new Big(0);
}

function parseAceOutcomeRow(row: AceOutcomeRow): Nullable<ParsedOutcome> {
  const outcome = asRecord(row.outcome);
  if (!outcome) return null;

  const result = String(outcome.result ?? '')
    .trim()
    .toUpperCase();
  if (result !== 'WIN' && result !== 'LOSS' && result !== 'BREAKEVEN') return null;

  const realizedPnL = toNumber(outcome.realizedPnL);
  if (realizedPnL === null) return null;

  return {
    symbol: row.symbol,
    market: row.market,
    result,
    realizedPnL: new Big(realizedPnL),
  };
}

function hasKeywordInFailures(rows: SignalFailureReasonRow[], keywords: string[]): boolean {
  const loweredKeywords = keywords.map((k) => k.toLowerCase());
  return rows.some((row) => {
    const reason = String(row.failure_reason ?? '').toLowerCase();
    if (!reason) return false;
    return loweredKeywords.some((keyword) => reason.includes(keyword));
  });
}

function buildNoTradeReasons(params: {
  guardEnabled: Nullable<boolean>;
  circuitBreakerCount: number;
  aiDailyReachedMarkets: AIMarket[];
  aiBuySellDecisions: number;
  signalBuySellCount: number;
  monthlyAiCost: number;
  signalFailures: SignalFailureReasonRow[];
}): string[] {
  const reasons: string[] = [];

  if (params.guardEnabled === false) reasons.push('system_guard 비활성');
  if (params.circuitBreakerCount > 0) reasons.push('서킷 브레이커 작동');
  if (params.aiDailyReachedMarkets.length > 0) reasons.push('AI 일 한도 도달');
  if (params.monthlyAiCost >= env.AI_MONTHLY_BUDGET_USD) reasons.push('AI 월 예산 초과');

  if (params.aiBuySellDecisions === 0) {
    reasons.push('AI 신호 없음');
  } else if (params.signalBuySellCount === 0) {
    if (hasKeywordInFailures(params.signalFailures, ['ma', 'moving average', '이평'])) {
      reasons.push('MA 필터 차단');
    }
    if (hasKeywordInFailures(params.signalFailures, ['regime', '레짐', '장세'])) {
      reasons.push('레짐 필터 차단');
    }
    if (!reasons.includes('MA 필터 차단') && !reasons.includes('레짐 필터 차단')) {
      reasons.push('신호 필터 차단');
    }
  }

  return reasons.length > 0 ? reasons : ['거래 조건 미충족'];
}

function formatCurrencySummary(byCurrency: Map<Currency, Big>): string {
  const ordered: Currency[] = ['KRW', 'USD'];
  const parts: string[] = [];

  for (const currency of ordered) {
    const amount = byCurrency.get(currency);
    if (!amount) continue;
    parts.push(formatCurrencyAmount(amount, currency));
  }

  if (parts.length === 0) return '0원';
  return parts.join(' / ');
}

async function safeQuery<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    logger.error(`daily-report 조회 실패(${label})`, error);
    return fallback;
  }
}

async function getMonthlyAICostWithRetry(params: { year: number; month: number }): Promise<number> {
  const maxAttempts = 3;
  const backoff = createBackoff({ baseMs: 500, maxMs: 4000 });
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getMonthlyAICost(params);
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isFetchFailure = message.includes('fetch failed');
      if (!isFetchFailure || attempt >= maxAttempts) break;

      const delayMs = backoff.nextDelayMs();
      logger.warn('daily-report ai_monthly_cost 재시도', {
        attempt,
        maxAttempts,
        delayMs,
        message,
      });
      await sleep(delayMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function getDailyAICounts(params: { date: string }): Promise<Record<AIMarket, number>> {
  const entries = await Promise.all(
    AI_MARKETS.map(async (market) => {
      const count = await getDailyCallCount({
        date: params.date,
        market,
      });
      return [market, count] as const;
    }),
  );

  const usage = createEmptyAIDailyUsage().byMarket;

  for (const [market, count] of entries) {
    usage[market] = count;
  }

  return usage;
}

function buildDailyAIUsage(params: {
  byMarket: Record<AIMarket, number>;
  monthlyAiCost: number;
  nowUtc: DateTime;
}): AIDailyUsage {
  const usage = createEmptyAIDailyUsage();
  usage.byMarket = params.byMarket;
  usage.total = sumAIMarketUsage(toBudgetUsage(params.byMarket));

  const policy = buildAIDailyBudgetPolicy({
    nowUtc: params.nowUtc,
    monthlyBudgetUsd: env.AI_MONTHLY_BUDGET_USD,
    monthlyUsedUsd: params.monthlyAiCost,
    globalDailyLimit: env.AI_DAILY_LIMIT,
    baseDailyLimitByMarket: {
      CRYPTO: env.AI_DAILY_LIMIT_CRYPTO,
      KRX: env.AI_DAILY_LIMIT_KRX,
      US: env.AI_DAILY_LIMIT_US,
    },
    avgCostPerCallUsd: env.AI_ESTIMATED_COST_PER_CALL_USD,
  });

  usage.effectiveLimitByMarket = {
    CRYPTO: policy.effectiveDailyLimitByMarket.CRYPTO,
    KRX: policy.effectiveDailyLimitByMarket.KRX,
    US: policy.effectiveDailyLimitByMarket.US,
  };
  usage.effectiveDailyCap = policy.effectiveDailyCap;
  usage.baseDailyTotal = policy.baseDailyLimitTotal;
  usage.sharedPool = policy.sharedPool;
  usage.scaledDown = policy.scaledDown;
  usage.todayCallCap = policy.todayCallCap;

  usage.reachedMarkets = AI_MARKETS.filter((market) =>
    isAIMarketDailyLimitReached({
      policy,
      usageByMarket: toBudgetUsage(usage.byMarket),
      market: toBudgetMarket(market),
    }),
  );

  return usage;
}

export async function buildDailyReportText(): Promise<string> {
  const window = buildPreviousKstDayWindow();
  const nowUtc = DateTime.now().toUTC();
  const reportUtcDate =
    DateTime.fromISO(window.toIso, { setZone: true }).toUTC().toISODate() ??
    nowUtc.toISODate() ??
    window.dayIsoDate;

  const [
    filledTrades,
    signalCounts,
    aiCounts,
    guardEnabled,
    circuitBreakerCount,
    signalFailures,
    aceOutcomeRows,
    aiDailyCounts,
    monthlyAiCost,
    aiUsageBySymbolRows,
  ] = await Promise.all([
    safeQuery(
      'trades',
      () => fetchTradesInRange({ ...window, status: 'filled' }),
      [] as TradeRow[],
    ),
    safeQuery('signals', () => fetchSignalCountsInRange(window), {
      buySellCount: 0,
      totalCount: 0,
    }),
    safeQuery('ai-decisions', () => fetchAiDecisionCountsInRange(window), {
      buySellCount: 0,
      totalCount: 0,
    }),
    safeQuery('system_guard', () => fetchSystemGuardTradingEnabled(), null as Nullable<boolean>),
    safeQuery('circuit_breaker', () => fetchCircuitBreakerCountInRange(window), 0),
    safeQuery(
      'signal_failures',
      () => fetchSignalFailureReasonsInRange(window),
      [] as SignalFailureReasonRow[],
    ),
    safeQuery('ace_outcomes', () => fetchAceOutcomesInRange(window), [] as AceOutcomeRow[]),
    safeQuery(
      'ai_daily_counts',
      () => getDailyAICounts({ date: reportUtcDate }),
      createEmptyAIDailyUsage().byMarket,
    ),
    safeQuery(
      'ai_monthly_cost',
      () => getMonthlyAICostWithRetry({ year: nowUtc.year, month: nowUtc.month }),
      0,
    ),
    safeQuery(
      'ai_symbol_usage',
      () => fetchAiUsageBySymbolInRange(window),
      [] as AiUsageBySymbolRow[],
    ),
  ]);
  const aiDailyUsage = buildDailyAIUsage({
    byMarket: aiDailyCounts,
    monthlyAiCost,
    nowUtc,
  });

  const byCurrency = new Map<Currency, Big>();
  let buyCount = 0;
  let sellCount = 0;

  for (const trade of filledTrades) {
    const side = String(trade.side ?? '')
      .trim()
      .toUpperCase();
    if (side === 'BUY') buyCount += 1;
    if (side === 'SELL') sellCount += 1;

    const currency = inferCurrency(trade.market);
    const current = byCurrency.get(currency) ?? new Big(0);
    byCurrency.set(currency, current.plus(calcTradeCashflow(trade)));
  }

  const parsedOutcomes = aceOutcomeRows
    .map(parseAceOutcomeRow)
    .filter((row): row is ParsedOutcome => row !== null);
  const winCount = parsedOutcomes.filter((row) => row.result === 'WIN').length;
  const winRate =
    parsedOutcomes.length > 0 ? ((winCount / parsedOutcomes.length) * 100).toFixed(1) + '%' : '-';

  const symbolPairs: Array<{ market: string; symbol: string }> = [];
  for (const trade of filledTrades) {
    symbolPairs.push({ market: trade.market, symbol: trade.symbol });
  }
  for (const outcome of parsedOutcomes) {
    symbolPairs.push({ market: outcome.market, symbol: outcome.symbol });
  }
  for (const usage of aiUsageBySymbolRows) {
    symbolPairs.push({ market: usage.market, symbol: usage.symbol });
  }

  const symbolCatalogRows = await safeQuery(
    'symbol_catalog',
    () => fetchSymbolCatalogRows(symbolPairs),
    [] as SymbolCatalogRow[],
  );
  const symbolCatalogMap = buildSymbolCatalogMap(symbolCatalogRows);

  const lines: string[] = [];
  const todayKstLabel = DateTime.now().setZone('Asia/Seoul').toFormat('yyyy.MM.dd');
  const reportDayKstLabel = DateTime.fromFormat(window.dayIsoDate, 'yyyy-MM-dd', {
    zone: 'Asia/Seoul',
  }).toFormat('yyyy.MM.dd');
  lines.push(env.DAILY_REPORT_TITLE);
  lines.push('표시 시간대: KST (Asia/Seoul)');
  lines.push(`데일리 리포트 (${todayKstLabel})`);
  lines.push(`기준: ${reportDayKstLabel}`);
  lines.push(`생성: ${toKstDisplay(DateTime.now())} (KST)`);
  lines.push('');

  lines.push(`총 손익: ${formatCurrencySummary(byCurrency)}`);
  lines.push(`체결: ${filledTrades.length}건 (BUY ${buyCount} / SELL ${sellCount})`);
  lines.push(`승률: ${winRate}`);
  lines.push('');

  if (filledTrades.length > 0) {
    lines.push('체결 내역:');

    if (parsedOutcomes.length > 0) {
      for (const outcome of parsedOutcomes.slice(0, 10)) {
        const symbolLabel = resolveSymbolDisplay(symbolCatalogMap, outcome.market, outcome.symbol);
        const pnlText = formatCurrencyAmount(outcome.realizedPnL, inferCurrency(outcome.market));
        lines.push(`- ${marketLabel(outcome.market)} | ${symbolLabel} | ${pnlText}`);
      }
    } else {
      for (const trade of filledTrades.slice(0, 10)) {
        const symbolLabel = resolveSymbolDisplay(symbolCatalogMap, trade.market, trade.symbol);
        const cashflow = calcTradeCashflow(trade);
        const currency = inferCurrency(trade.market);
        lines.push(
          `- ${marketLabel(trade.market)} | ${symbolLabel} | ${String(trade.side).toUpperCase()} | ${formatCurrencyAmount(cashflow, currency)}`,
        );
      }
    }
  } else {
    lines.push('거래 없음 사유:');
    const reasons = buildNoTradeReasons({
      guardEnabled,
      circuitBreakerCount,
      aiDailyReachedMarkets: aiDailyUsage.reachedMarkets,
      aiBuySellDecisions: aiCounts.buySellCount,
      signalBuySellCount: signalCounts.buySellCount,
      monthlyAiCost,
      signalFailures,
    });
    for (const reason of reasons) {
      lines.push(`- ${reason}`);
    }
  }

  lines.push('');
  lines.push('AI 사용:');
  const dailyUsageByMarket = AI_MARKETS.map(
    (market) =>
      `${market} ${aiDailyUsage.byMarket[market]}/${aiDailyUsage.effectiveLimitByMarket[market]}`,
  );
  lines.push(`- 일 사용(UTC 집계, 시장별): ${dailyUsageByMarket.join(' / ')}`);
  lines.push(
    `- 일 사용 총합(UTC 집계): ${aiDailyUsage.total} / ${aiDailyUsage.effectiveDailyCap} (base ${aiDailyUsage.baseDailyTotal}, shared ${aiDailyUsage.sharedPool})`,
  );
  lines.push(
    `- 일 예산 모드: ${aiDailyUsage.scaledDown ? '축소(비율)' : '기본+공유풀'} (today_cap=${aiDailyUsage.todayCallCap})`,
  );
  const monthlyRatio =
    env.AI_MONTHLY_BUDGET_USD > 0 ? (monthlyAiCost / env.AI_MONTHLY_BUDGET_USD) * 100 : 0;
  lines.push(
    `- 월 사용(UTC 집계): $${monthlyAiCost.toFixed(2)} / $${env.AI_MONTHLY_BUDGET_USD.toFixed(2)} (${monthlyRatio.toFixed(0)}%)`,
  );

  lines.push('- 종목별 AI 사용(UTC 집계, 상위 15):');
  if (aiUsageBySymbolRows.length === 0) {
    lines.push('  - 없음');
  } else {
    const maxRows = 15;
    for (const row of aiUsageBySymbolRows.slice(0, maxRows)) {
      const symbolLabel = resolveSymbolDisplay(symbolCatalogMap, row.market, row.symbol);
      lines.push(`  - ${marketLabel(row.market)} | ${symbolLabel} | ${row.usageCount}회`);
    }
    if (aiUsageBySymbolRows.length > maxRows) {
      lines.push(`  - 외 ${aiUsageBySymbolRows.length - maxRows}종목`);
    }
  }

  return lines.join('\n');
}
