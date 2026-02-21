import { getDailyCallCount, getMonthlyAICost, getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import { env } from '../config/env.js';
import type { AlertEvent } from '../types/status.js';

const AI_MARKETS = ['KRX', 'US', 'CRYPTO'] as const;
const MONTHLY_WARN_RATIO = 0.8;

async function estimateCurrentHourCallCount(): Promise<number> {
  const supabase = getSupabase();
  const hourStartIso = DateTime.now().toUTC().startOf('hour').toISO();
  if (!hourStartIso) return 0;

  const { data, error } = await supabase
    .from('ai_analysis_results')
    .select('market,created_at')
    .gte('created_at', hourStartIso);

  if (error) {
    throw new Error(`ai_analysis_results(시간 호출 추정) 조회 실패: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  const deduped = new Set<string>();

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const market = record.market;
    const createdAt = record.created_at;
    if (typeof market !== 'string' || typeof createdAt !== 'string') continue;
    deduped.add(`${market}|${createdAt}`);
  }

  return deduped.size;
}

async function getDailyTotalCallCount(): Promise<number> {
  const todayIso = DateTime.now().toUTC().toISODate();
  if (!todayIso) return 0;

  let total = 0;
  for (const market of AI_MARKETS) {
    total += await getDailyCallCount({
      date: todayIso,
      market,
    });
  }

  return total;
}

async function getMonthlyTotalCost(): Promise<number> {
  const nowUtc = DateTime.now().toUTC();
  return getMonthlyAICost({
    year: nowUtc.year,
    month: nowUtc.month,
  });
}

export async function checkAiBudget(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const nowKst = DateTime.now().setZone('Asia/Seoul');
  const nowKstLabel = nowKst.toFormat('yy.MM.dd HH:mm');
  const dateKstLabel = nowKst.toFormat('yy.MM.dd');

  const [hourlyCalls, dailyCalls, monthlyCost] = await Promise.all([
    estimateCurrentHourCallCount(),
    getDailyTotalCallCount(),
    getMonthlyTotalCost(),
  ]);

  if (hourlyCalls >= env.AI_HOURLY_LIMIT) {
    events.push({
      level: 'CRIT',
      category: 'ai_budget_hourly_limit',
      market: 'GLOBAL',
      title: 'AI 시간 한도 초과',
      message: [
        `현재 사용: ${hourlyCalls} / ${env.AI_HOURLY_LIMIT}`,
        `시간: ${nowKstLabel} (KST)`,
      ].join('\n'),
      at: nowIso(),
    });
  }

  if (dailyCalls >= env.AI_DAILY_LIMIT) {
    events.push({
      level: 'CRIT',
      category: 'ai_budget_daily_limit',
      market: 'GLOBAL',
      title: 'AI 일일 한도 초과',
      message: [`현재 사용: ${dailyCalls} / ${env.AI_DAILY_LIMIT}`, `날짜: ${dateKstLabel}`].join(
        '\n',
      ),
      at: nowIso(),
    });
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
