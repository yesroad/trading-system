import { env } from '../config/env.js';
import { diffMinutes, toKstIso } from '../utils/time.js';
import type { AlertEvent, AlertLevel } from '../types/status.js';
import { fetchLatestAiResultsByMarket } from '../db/queries.js';
import { nowIso } from '@workspace/shared-utils';

type AiLatest = {
  market: string;
  latest_created_at: string | null;
};

function levelOfAiStale(mins: number): AlertLevel | null {
  if (mins >= env.AI_STALE_CRIT_MIN) return 'CRIT';
  if (mins >= env.AI_STALE_WARN_MIN) return 'WARN';
  return null;
}

export async function checkAiResults(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];

  const markets: Array<{ key: 'KR' | 'US' | 'CRYPTO'; enabled: boolean }> = [
    { key: 'KR', enabled: env.ENABLE_KR },
    { key: 'US', enabled: env.ENABLE_US },
    { key: 'CRYPTO', enabled: env.ENABLE_CRYPTO },
  ];

  const enabledMarkets = markets.filter((m) => m.enabled).map((m) => m.key);
  if (!enabledMarkets.length) return events;

  const rows = (await fetchLatestAiResultsByMarket(enabledMarkets)) as AiLatest[];

  for (const m of enabledMarkets) {
    const row = rows.find((r) => r.market === m);
    if (!row || !row.latest_created_at) {
      events.push({
        level: 'WARN',
        category: 'ai_missing',
        market: m,
        title: `AI 결과 없음`,
        message: `ai_analysis_results에 ${m} 시장 결과가 아직 없습니다.`,
        at: nowIso(),
      });
      continue;
    }

    const mins = diffMinutes(row.latest_created_at, nowIso());
    const lvl = levelOfAiStale(mins);
    if (!lvl) continue;

    events.push({
      level: lvl,
      category: 'ai_stale',
      market: m,
      title: `AI 멈춤 감지`,
      message: [
        `마지막 AI 결과: ${toKstIso(row.latest_created_at)}`,
        `경과: ${mins.toFixed(1)}분`,
        `기준: WARN=${env.AI_STALE_WARN_MIN}m / CRIT=${env.AI_STALE_CRIT_MIN}m`,
        lvl === 'CRIT' ? '가능 원인: shouldCallAIBySnapshot 미통과, 쿨다운/비용 제한' : null,
      ]
        .filter(Boolean)
        .join('\n'),
      at: nowIso(),
    });
  }

  return events;
}
