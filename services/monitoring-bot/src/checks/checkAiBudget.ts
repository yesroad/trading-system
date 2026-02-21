import { getDailyCallCount, getMonthlyAICost, getSupabase } from '@workspace/db-client';
import { createBackoff, createLogger, nowIso, sleep, toIsoString } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import { env } from '../config/env.js';
import type { AlertEvent } from '../types/status.js';

const AI_MARKETS = ['KRX', 'US', 'CRYPTO'] as const;
const MONTHLY_WARN_RATIO = 0.8;
const logger = createLogger('monitoring-bot:check-ai-budget');
type AIMarket = (typeof AI_MARKETS)[number];
type BudgetAlertMarket = Exclude<AlertEvent['market'], 'GLOBAL'>;

function normalizeAiMarket(raw: unknown): AIMarket | null {
  const value = String(raw ?? '')
    .trim()
    .toUpperCase();

  if (value === 'KR' || value === 'KRX') return 'KRX';
  if (value === 'US') return 'US';
  if (value === 'CRYPTO') return 'CRYPTO';
  return null;
}

function emptyMarketCounts(): Record<AIMarket, number> {
  return {
    KRX: 0,
    US: 0,
    CRYPTO: 0,
  };
}

function getDailyLimitByMarket(market: AIMarket): number {
  if (market === 'CRYPTO') return env.AI_DAILY_LIMIT_CRYPTO;
  if (market === 'KRX') return env.AI_DAILY_LIMIT_KRX;
  return env.AI_DAILY_LIMIT_US;
}

function isDailyLimitReached(market: AIMarket, count: number): boolean {
  const limit = getDailyLimitByMarket(market);
  if (limit <= 0) return count > 0;
  return count >= limit;
}

function toAlertMarket(market: AIMarket): BudgetAlertMarket {
  if (market === 'KRX') return 'KR';
  return market;
}

function formatMarketCounts(counts: Record<AIMarket, number>): string {
  return AI_MARKETS.map((market) => `${market} ${counts[market]}`).join(' / ');
}

function formatDailyUsageWithLimit(counts: Record<AIMarket, number>): string {
  return AI_MARKETS.map(
    (market) => `${market} ${counts[market]}/${getDailyLimitByMarket(market)}`,
  ).join(' / ');
}

async function estimateCurrentHourCallCount(nowUtc: DateTime): Promise<Record<AIMarket, number>> {
  const supabase = getSupabase();
  const hourStartIso = toIsoString(nowUtc.startOf('hour'));

  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('market,created_at')
    .gte('created_at', hourStartIso);

  if (error) {
    throw new Error(`ai_analysis_results(시간 호출 추정) 조회 실패: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const dedupedByMarket = new Map<AIMarket, Set<string>>();

  for (const market of AI_MARKETS) {
    dedupedByMarket.set(market, new Set<string>());
  }

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const market = normalizeAiMarket(record.market);
    const createdAt = record.created_at;
    if (!market || typeof createdAt !== 'string') continue;
    dedupedByMarket.get(market)?.add(createdAt);
  }

  const counts = emptyMarketCounts();

  for (const market of AI_MARKETS) {
    counts[market] = dedupedByMarket.get(market)?.size ?? 0;
  }

  return counts;
}

async function getDailyCallCounts(date: string): Promise<Record<AIMarket, number>> {
  const entries = await Promise.all(
    AI_MARKETS.map(async (market) => {
      const count = await getDailyCallCount({
        date,
        market,
      });
      return [market, count] as const;
    }),
  );

  const counts = emptyMarketCounts();
  for (const [market, count] of entries) {
    counts[market] = count;
  }

  return counts;
}

function findExceededMarkets(counts: Record<AIMarket, number>, limit: number): AIMarket[] {
  return AI_MARKETS.filter((market) => counts[market] >= limit);
}

function findExceededDailyMarkets(counts: Record<AIMarket, number>): AIMarket[] {
  return AI_MARKETS.filter((market) => isDailyLimitReached(market, counts[market]));
}

async function getMonthlyTotalCostWithRetry(params: {
  year: number;
  month: number;
}): Promise<number> {
  const maxAttempts = 3;
  const retry = createBackoff({ baseMs: 250, maxMs: 2000 });
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await getMonthlyAICost(params);
    } catch (error: unknown) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const isFetchFailure = message.includes('fetch failed');
      if (!isFetchFailure || attempt >= maxAttempts) break;

      const delayMs = retry.nextDelayMs();
      logger.warn('ai-budget 월비용 조회 재시도', { attempt, delayMs, message });
      await sleep(delayMs);
    }
  }

  throw lastError ?? new Error('월별 비용 조회 실패');
}

export async function checkAiBudget(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const nowUtc = DateTime.now().toUTC();
  const nowKst = nowUtc.setZone('Asia/Seoul');
  const nowKstLabel = nowKst.toFormat('yy.MM.dd HH:mm');
  const dateUtc = nowUtc.toISODate();
  if (!dateUtc) return events;

  const [hourlyCalls, dailyCalls, monthlyCost] = await Promise.all([
    estimateCurrentHourCallCount(nowUtc),
    getDailyCallCounts(dateUtc),
    getMonthlyTotalCostWithRetry({
      year: nowUtc.year,
      month: nowUtc.month,
    }),
  ]);

  const hourlyExceededMarkets = findExceededMarkets(hourlyCalls, env.AI_HOURLY_LIMIT);
  if (hourlyExceededMarkets.length > 0) {
    events.push({
      level: 'CRIT',
      category: 'ai_budget_hourly_limit',
      market: 'GLOBAL',
      title: 'AI 시간 한도 초과',
      message: [
        `한도 도달 시장: ${hourlyExceededMarkets.join(', ')}`,
        `시장별 사용: ${formatMarketCounts(hourlyCalls)} (시장별 한도 ${env.AI_HOURLY_LIMIT})`,
        `시간: ${nowKstLabel} (KST)`,
      ].join('\n'),
      at: nowIso(),
    });
  }

  const dailyExceededMarkets = findExceededDailyMarkets(dailyCalls);
  if (dailyExceededMarkets.length > 0) {
    for (const market of dailyExceededMarkets) {
      const limit = getDailyLimitByMarket(market);
      const used = dailyCalls[market];

      events.push({
        level: 'CRIT',
        category: 'ai_budget_daily_limit',
        market: toAlertMarket(market),
        title: `AI 일일 한도 도달 (${market})`,
        message: [
          `시장: ${market}`,
          `현재 사용/한도: ${used}/${limit}`,
          `전체 시장 사용/한도: ${formatDailyUsageWithLimit(dailyCalls)}`,
          `시간: ${nowKstLabel} (KST)`,
        ].join('\n'),
        at: nowIso(),
      });
    }
  }

  if (monthlyCost >= env.AI_MONTHLY_BUDGET_USD) {
    events.push({
      level: 'CRIT',
      category: 'ai_budget_monthly_limit',
      market: 'GLOBAL',
      title: 'AI 월 예산 초과',
      message: [
        `현재 사용: $${monthlyCost.toFixed(2)} / $${env.AI_MONTHLY_BUDGET_USD.toFixed(2)}`,
        `시간: ${nowKstLabel} (KST)`,
      ].join('\n'),
      at: nowIso(),
    });
  } else if (monthlyCost >= env.AI_MONTHLY_BUDGET_USD * MONTHLY_WARN_RATIO) {
    events.push({
      level: 'CRIT',
      category: 'ai_budget_monthly_80',
      market: 'GLOBAL',
      title: 'AI 월 예산 80% 도달',
      message: [
        `현재 사용: $${monthlyCost.toFixed(2)} / $${env.AI_MONTHLY_BUDGET_USD.toFixed(2)}`,
        `시간: ${nowKstLabel} (KST)`,
      ].join('\n'),
      at: nowIso(),
    });
  }

  return events;
}
