import { env } from '../config/env';
import { toKstIso, diffMinutes } from '../utils/time';
import type { AlertEvent, AlertLevel, AlertMarket } from '../types/status';
import { fetchRecentIngestionRuns } from '../db/queries';

type IngestionRun = {
  id: number;
  job: string;
  symbols: string[];
  timeframe: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  inserted_count: number;
  updated_count: number;
  error_message: string | null;
};

function levelOfRunningLag(mins: number): AlertLevel | null {
  if (mins >= env.INGESTION_RUNNING_CRIT_MIN) return 'CRIT';
  if (mins >= env.INGESTION_RUNNING_WARN_MIN) return 'WARN';
  return null;
}

function levelOfStale(mins: number): AlertLevel | null {
  if (mins >= env.INGESTION_STALE_CRIT_MIN) return 'CRIT';
  if (mins >= env.INGESTION_STALE_WARN_MIN) return 'WARN';
  return null;
}

export async function checkIngestionRuns(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];

  const jobsByMarket: Array<{
    market: AlertMarket;
    enabled: boolean;
    jobs: string[];
  }> = [
    { market: 'KR', enabled: env.ENABLE_KR, jobs: [] },
    { market: 'US', enabled: env.ENABLE_US, jobs: ['yfinance-equity'] },
    { market: 'CRYPTO', enabled: env.ENABLE_CRYPTO, jobs: ['upbit-candle'] },
  ];

  // 최근 N개만 보면 충분 (너무 많으면 비용/부하)
  const runs = (await fetchRecentIngestionRuns(50)) as IngestionRun[];

  // job별로 묶기
  const byJob = new Map<string, IngestionRun[]>();
  for (const r of runs) {
    if (!byJob.has(r.job)) byJob.set(r.job, []);
    byJob.get(r.job)!.push(r);
  }

  for (const cfg of jobsByMarket) {
    if (!cfg.enabled) continue;
    for (const job of cfg.jobs) {
      const list = byJob.get(job) ?? [];
      if (!list.length) {
        events.push({
          level: 'WARN',
          category: 'ingestion_missing',
          market: cfg.market,
          title: `수집 실행 기록 없음`,
          message: `최근 ingestion_runs에 ${job} 실행 기록이 없습니다.`,
          at: new Date().toISOString(),
        });
        continue;
      }

      // running 오래 걸리는 것 감지
      const running = list.filter((r) => r.status === 'running' && !r.finished_at);
      for (const r of running) {
        const lagMin = diffMinutes(new Date(r.started_at), new Date());
        const lvl = levelOfRunningLag(lagMin);
        if (!lvl) continue;

        events.push({
          level: lvl,
          category: 'ingestion_running',
          market: cfg.market,
          title: `수집 실행 지연`,
          message: [
            `job: ${r.job}`,
            `상태: running`,
            `시작: ${toKstIso(r.started_at)}`,
            `지연: ${lagMin.toFixed(1)}분`,
            `timeframe: ${r.timeframe}`,
            `symbols: ${Array.isArray(r.symbols) ? r.symbols.slice(0, 5).join(', ') : '-'}`,
          ].join('\n'),
          at: new Date().toISOString(),
        });
      }

      // 최근 성공 실행 stale 감지
      const success = list
        .filter((x) => x.status === 'success')
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];

      if (!success) {
        events.push({
          level: 'WARN',
          category: 'ingestion_missing',
          market: cfg.market,
          title: `수집 성공 기록 없음`,
          message: `최근 runs에 success 상태가 없습니다. (job=${job})`,
          at: new Date().toISOString(),
        });
        continue;
      }

      const staleMin = diffMinutes(new Date(success.started_at), new Date());
      const lvl = levelOfStale(staleMin);
      if (!lvl) continue;

      events.push({
        level: lvl,
        category: 'ingestion_stale',
        market: cfg.market,
        title: `수집 stale 감지`,
        message: [
          `job: ${job}`,
          `최근 성공 시각: ${toKstIso(success.started_at)}`,
          `경과: ${staleMin.toFixed(1)}분`,
          `기준: WARN=${env.INGESTION_STALE_WARN_MIN}m / CRIT=${env.INGESTION_STALE_CRIT_MIN}m`,
        ].join('\n'),
        at: new Date().toISOString(),
      });
    }
  }

  return events;
}
