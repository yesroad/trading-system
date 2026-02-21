import Big from 'big.js';
import { DateTime } from 'luxon';
import { getMonthlyAICost } from '@workspace/db-client';
import { env } from '../config/env.js';
import {
  buildPreviousKstDayWindow,
  fetchAceOutcomesInRange,
  fetchAiDecisionCountsInRange,
  fetchCircuitBreakerCountInRange,
  fetchSignalCountsInRange,
  fetchSignalFailureReasonsInRange,
  fetchSymbolCatalogRows,
  fetchSystemGuardTradingEnabled,
  fetchTradesInRange,
  type AceOutcomeRow,
  type SignalFailureReasonRow,
  type SymbolCatalogRow,
  type TradeRow,
} from '../db/queries.js';
import { formatSignedNumber, marketLabel, toKstDisplay } from '../utils/time.js';

type Currency = 'KRW' | 'USD';
type ParsedOutcome = {
  symbol: string;
  market: string;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  realizedPnL: Big;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
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
  raw: string | null | undefined,
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
): SymbolCatalogRow | null {
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

function parseAceOutcomeRow(row: AceOutcomeRow): ParsedOutcome | null {
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
  guardEnabled: boolean | null;
  circuitBreakerCount: number;
  aiDailyCalls: number;
  aiBuySellDecisions: number;
  signalBuySellCount: number;
  monthlyAiCost: number;
  signalFailures: SignalFailureReasonRow[];
}): string[] {
  const reasons: string[] = [];

  if (params.guardEnabled === false) reasons.push('system_guard 비활성');
  if (params.circuitBreakerCount > 0) reasons.push('서킷 브레이커 작동');
  if (params.aiDailyCalls >= env.AI_DAILY_LIMIT) reasons.push('AI 일 한도 도달');
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
    console.error(
      `[TRADING] daily-report 조회 실패(${label}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return fallback;
  }
}

export async function buildDailyReportText(): Promise<string> {
  const window = buildPreviousKstDayWindow();
  const reportDate = DateTime.fromFormat(window.dayIsoDate, 'yyyy-MM-dd', {
    zone: 'Asia/Seoul',
  });

  const [
    filledTrades,
    signalCounts,
    aiCounts,
    guardEnabled,
    circuitBreakerCount,
    signalFailures,
    aceOutcomeRows,
    monthlyAiCost,
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
    safeQuery('system_guard', () => fetchSystemGuardTradingEnabled(), null as boolean | null),
    safeQuery('circuit_breaker', () => fetchCircuitBreakerCountInRange(window), 0),
    safeQuery(
      'signal_failures',
      () => fetchSignalFailureReasonsInRange(window),
      [] as SignalFailureReasonRow[],
    ),
    safeQuery('ace_outcomes', () => fetchAceOutcomesInRange(window), [] as AceOutcomeRow[]),
    safeQuery(
      'ai_monthly_cost',
      () =>
        getMonthlyAICost({
          year: reportDate.year,
          month: reportDate.month,
        }),
      0,
    ),
  ]);

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

  const symbolCatalogRows = await safeQuery(
    'symbol_catalog',
    () => fetchSymbolCatalogRows(symbolPairs),
    [] as SymbolCatalogRow[],
  );
  const symbolCatalogMap = buildSymbolCatalogMap(symbolCatalogRows);

  const lines: string[] = [];
  lines.push(env.DAILY_REPORT_TITLE);
  lines.push(`${window.dateLabel} 데일리 리포트`);
  lines.push(`기준: ${window.rangeLabel}`);
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
      aiDailyCalls: aiCounts.totalCount,
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
  lines.push(`- 일 사용: ${aiCounts.totalCount} / ${env.AI_DAILY_LIMIT}`);
  const monthlyRatio =
    env.AI_MONTHLY_BUDGET_USD > 0 ? (monthlyAiCost / env.AI_MONTHLY_BUDGET_USD) * 100 : 0;
  lines.push(
    `- 월 사용: $${monthlyAiCost.toFixed(2)} / $${env.AI_MONTHLY_BUDGET_USD.toFixed(2)} (${monthlyRatio.toFixed(0)}%)`,
  );

  return lines.join('\n');
}
