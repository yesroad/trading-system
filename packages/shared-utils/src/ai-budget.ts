import { DateTime } from 'luxon';

export const AI_BUDGET_MARKETS = ['CRYPTO', 'KRX', 'US'] as const;
export type AIBudgetMarket = (typeof AI_BUDGET_MARKETS)[number];

export type AIDailyBudgetPolicyInput = {
  monthlyBudgetUsd: number;
  monthlyUsedUsd: number;
  globalDailyLimit: number;
  baseDailyLimitByMarket: Record<AIBudgetMarket, number>;
  avgCostPerCallUsd: number;
  nowUtc?: DateTime;
};

export type AIDailyBudgetPolicy = {
  baseDailyLimitByMarket: Record<AIBudgetMarket, number>;
  baseDailyLimitTotal: number;
  globalDailyLimit: number;
  avgCostPerCallUsd: number;
  remainingBudgetUsd: number;
  remainingDays: number;
  todayBudgetUsd: number;
  todayCallCap: number;
  effectiveDailyCap: number;
  effectiveDailyLimitByMarket: Record<AIBudgetMarket, number>;
  sharedPool: number;
  scaledDown: boolean;
};

function toNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function toNonNegativeNumber(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function getRemainingUtcDaysInclusive(nowUtc: DateTime): number {
  const start = nowUtc.startOf('day');
  const monthEnd = nowUtc.endOf('month').startOf('day');
  const diffDays = Math.floor(monthEnd.diff(start, 'days').days) + 1;
  return Math.max(1, diffDays);
}

function emptyLimitMap(): Record<AIBudgetMarket, number> {
  return {
    CRYPTO: 0,
    KRX: 0,
    US: 0,
  };
}

function normalizeLimitMap(
  baseLimit: Record<AIBudgetMarket, number>,
): Record<AIBudgetMarket, number> {
  const out = emptyLimitMap();
  for (const market of AI_BUDGET_MARKETS) {
    out[market] = toNonNegativeInt(baseLimit[market]);
  }
  return out;
}

function sumByMarket(values: Record<AIBudgetMarket, number>): number {
  let total = 0;
  for (const market of AI_BUDGET_MARKETS) {
    total += toNonNegativeInt(values[market]);
  }
  return total;
}

function scaleLimitsByRatio(params: {
  baseByMarket: Record<AIBudgetMarket, number>;
  targetTotal: number;
}): Record<AIBudgetMarket, number> {
  const targetTotal = toNonNegativeInt(params.targetTotal);
  const baseByMarket = normalizeLimitMap(params.baseByMarket);
  const baseTotal = sumByMarket(baseByMarket);

  if (targetTotal <= 0 || baseTotal <= 0) return emptyLimitMap();
  if (targetTotal >= baseTotal) return baseByMarket;

  const floors = emptyLimitMap();
  const remainders: Array<{ market: AIBudgetMarket; frac: number; base: number }> = [];

  let used = 0;
  for (const market of AI_BUDGET_MARKETS) {
    const raw = (baseByMarket[market] * targetTotal) / baseTotal;
    const floorValue = Math.floor(raw);
    floors[market] = floorValue;
    used += floorValue;
    remainders.push({
      market,
      frac: raw - floorValue,
      base: baseByMarket[market],
    });
  }

  let remain = targetTotal - used;
  if (remain <= 0) return floors;

  remainders.sort((a, b) => {
    if (b.frac !== a.frac) return b.frac - a.frac;
    if (b.base !== a.base) return b.base - a.base;
    return a.market.localeCompare(b.market);
  });

  for (const item of remainders) {
    if (remain <= 0) break;
    floors[item.market] += 1;
    remain -= 1;
  }

  return floors;
}

export function buildAIDailyBudgetPolicy(params: AIDailyBudgetPolicyInput): AIDailyBudgetPolicy {
  const nowUtc = params.nowUtc ?? DateTime.now().toUTC();
  const globalDailyLimit = toNonNegativeInt(params.globalDailyLimit);
  const baseDailyLimitByMarket = normalizeLimitMap(params.baseDailyLimitByMarket);
  const baseDailyLimitTotal = sumByMarket(baseDailyLimitByMarket);
  const avgCostPerCallUsd = toNonNegativeNumber(params.avgCostPerCallUsd);

  const remainingBudgetUsd = Math.max(
    0,
    toNonNegativeNumber(params.monthlyBudgetUsd) - toNonNegativeNumber(params.monthlyUsedUsd),
  );
  const remainingDays = getRemainingUtcDaysInclusive(nowUtc);
  const todayBudgetUsd = remainingDays > 0 ? remainingBudgetUsd / remainingDays : 0;

  const todayCallCap =
    avgCostPerCallUsd > 0 ? toNonNegativeInt(todayBudgetUsd / avgCostPerCallUsd) : globalDailyLimit;
  const effectiveDailyCap = Math.min(globalDailyLimit, todayCallCap);
  const scaledDown = effectiveDailyCap < baseDailyLimitTotal;

  const effectiveDailyLimitByMarket = scaledDown
    ? scaleLimitsByRatio({
        baseByMarket: baseDailyLimitByMarket,
        targetTotal: effectiveDailyCap,
      })
    : baseDailyLimitByMarket;

  const sharedPool = scaledDown ? 0 : Math.max(0, effectiveDailyCap - baseDailyLimitTotal);

  return {
    baseDailyLimitByMarket,
    baseDailyLimitTotal,
    globalDailyLimit,
    avgCostPerCallUsd,
    remainingBudgetUsd,
    remainingDays,
    todayBudgetUsd,
    todayCallCap,
    effectiveDailyCap,
    effectiveDailyLimitByMarket,
    sharedPool,
    scaledDown,
  };
}

export function sumAIMarketUsage(usageByMarket: Record<AIBudgetMarket, number>): number {
  return sumByMarket(usageByMarket);
}

export function canUseDailyBudgetForMarket(params: {
  policy: AIDailyBudgetPolicy;
  usageByMarket: Record<AIBudgetMarket, number>;
  market: AIBudgetMarket;
}): boolean {
  const totalUsed = sumAIMarketUsage(params.usageByMarket);
  if (totalUsed >= params.policy.effectiveDailyCap) return false;

  const marketLimit = toNonNegativeInt(params.policy.effectiveDailyLimitByMarket[params.market]);
  const marketUsed = toNonNegativeInt(params.usageByMarket[params.market]);

  if (params.policy.scaledDown) {
    if (marketLimit <= 0) return false;
    return marketUsed < marketLimit;
  }

  // base가 0인 시장(예: US=0)은 공유풀 차입 대상에서 제외한다.
  if (marketLimit <= 0) return false;
  if (marketUsed < marketLimit) return true;

  return totalUsed < params.policy.effectiveDailyCap;
}

export function isAIMarketDailyLimitReached(params: {
  policy: AIDailyBudgetPolicy;
  usageByMarket: Record<AIBudgetMarket, number>;
  market: AIBudgetMarket;
}): boolean {
  const marketLimit = toNonNegativeInt(params.policy.effectiveDailyLimitByMarket[params.market]);
  const marketUsed = toNonNegativeInt(params.usageByMarket[params.market]);
  const totalUsed = sumAIMarketUsage(params.usageByMarket);

  if (marketLimit <= 0) return false;
  if (marketUsed < marketLimit) return false;

  if (params.policy.scaledDown) return true;
  if (params.policy.sharedPool <= 0) return true;

  return totalUsed >= params.policy.effectiveDailyCap;
}
