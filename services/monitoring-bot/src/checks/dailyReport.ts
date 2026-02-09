import { env } from '../config/env.js';
import { toKstIso } from '../utils/time.js';
import {
  fetchLatestWorkers,
  fetchLatestAiResultsByMarket,
  fetchLatestIngestionSuccessByJobs,
} from '../db/queries.js';
import { nowIso } from '@workspace/shared-utils';

type WorkerRow = {
  service: string;
  state: string;
  last_event_at: string | null;
  last_success_at: string | null;
  message: string | null;
};

type AiLatest = { market: string; latest_created_at: string | null };
type IngestionLatest = { job: string; latest_success_at: string | null };

export async function buildDailyReportText(): Promise<string> {
  const lines: string[] = [];
  lines.push(env.DAILY_REPORT_TITLE);
  lines.push('');
  lines.push(`시간: ${nowIso()}`);

  // workers 요약
  const workers = (await fetchLatestWorkers()) as WorkerRow[];
  const failed = workers.filter((w) => w.state === 'failed');
  const running = workers.filter((w) => w.state === 'running');
  lines.push('');
  lines.push(
    `- 워커: 총 ${workers.length}개 | failed=${failed.length} | running=${running.length}`,
  );
  for (const w of failed.slice(0, 5)) {
    lines.push(
      `  - FAIL ${w.service} | last_success=${w.last_success_at ? toKstIso(w.last_success_at) : '-'}`,
    );
  }

  // ingestion 최신 성공 요약 (잡이 많다면 여기서 제한)
  const jobsToWatch: string[] = [];
  if (env.ENABLE_KR) jobsToWatch.push('kis-equity');
  if (env.ENABLE_US) jobsToWatch.push('yfinance-equity');
  if (env.ENABLE_CRYPTO) jobsToWatch.push('upbit-candle');

  const ing = (await fetchLatestIngestionSuccessByJobs(jobsToWatch)) as IngestionLatest[];
  lines.push('');
  lines.push(`- 수집 최신 성공`);
  for (const j of jobsToWatch) {
    const row = ing.find((x) => x.job === j);
    lines.push(`  - ${j}: ${row?.latest_success_at ? toKstIso(row.latest_success_at) : '-'}`);
  }

  // AI 최신 결과 요약
  const markets: string[] = [];
  if (env.ENABLE_KR) markets.push('KR');
  if (env.ENABLE_US) markets.push('US');
  if (env.ENABLE_CRYPTO) markets.push('CRYPTO');

  const ai = (await fetchLatestAiResultsByMarket(
    markets as Array<'KR' | 'US' | 'CRYPTO'>,
  )) as AiLatest[];
  lines.push('');
  lines.push(`- AI 최신 결과`);
  for (const m of markets) {
    const row = ai.find((x) => x.market === m);
    lines.push(`  - ${m}: ${row?.latest_created_at ? toKstIso(row.latest_created_at) : '-'}`);
  }

  return lines.join('\n');
}
