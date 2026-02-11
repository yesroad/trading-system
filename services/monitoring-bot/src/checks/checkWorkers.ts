import { env } from '../config/env.js';
import { DateTime } from 'luxon';
import { diffMinutes, toKstIso } from '../utils/time.js';
import type { AlertEvent, AlertMarket } from '../types/status.js';
import { fetchLatestWorkers } from '../db/queries.js';
import { nowIso } from '@workspace/shared-utils';

type WorkerRow = {
  service: string;
  state: string;
  run_mode: string | null;
  last_event_at: string | null;
  last_success_at: string | null;
  message: string | null;
};

const MARKET_WORKERS: Array<{
  market: AlertMarket;
  enabled: boolean;
  service: string;
}> = [
  { market: 'KR', enabled: env.ENABLE_KR, service: 'kis-collector' },
  { market: 'US', enabled: env.ENABLE_US, service: 'yf-collector' },
  { market: 'CRYPTO', enabled: env.ENABLE_CRYPTO, service: 'upbit-collector' },
];

function levelOfWorkerLag(mins: number): 'WARN' | 'CRIT' | null {
  if (mins >= env.WORKER_LAG_CRIT_MIN) return 'CRIT';
  if (mins >= env.WORKER_LAG_WARN_MIN) return 'WARN';
  return null;
}

function isSkippedState(state: string): boolean {
  return state.trim().toUpperCase() === 'SKIPPED';
}

function normalizeRunMode(raw: string | null | undefined): 'MARKET' | 'PREMARKET' | 'AFTERMARKET' | 'EXTENDED' | 'NO_CHECK' {
  const normalized = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (normalized === 'NO_CHECK' || normalized === 'ALWAYS') return 'NO_CHECK';
  if (normalized === 'EXTENDED') return 'EXTENDED';
  if (normalized === 'PREMARKET') return 'PREMARKET';
  if (normalized === 'AFTERMARKET') return 'AFTERMARKET';
  if (normalized === 'MARKET_ONLY' || normalized === 'MARKET') return 'MARKET';
  return 'MARKET';
}

function isOutsideWindow(market: AlertMarket, runModeRaw: string | null | undefined): boolean {
  const runMode = normalizeRunMode(runModeRaw);
  if (runMode === 'NO_CHECK') return false;
  if (market === 'CRYPTO') return false;

  if (market === 'KR') {
    const now = DateTime.now().setZone('Asia/Seoul');
    if (now.weekday >= 6) return true;
    const minutes = now.hour * 60 + now.minute;
    if (runMode === 'PREMARKET') return minutes < 8 * 60 || minutes > 9 * 60;
    if (runMode === 'AFTERMARKET') return minutes < 15 * 60 + 30 || minutes > 16 * 60;
    if (runMode === 'EXTENDED') return minutes < 8 * 60 || minutes > 16 * 60;
    return minutes < 9 * 60 || minutes > 15 * 60 + 30;
  }

  if (market === 'US') {
    const now = DateTime.now().setZone('America/New_York');
    if (now.weekday >= 6) return true;
    const minutes = now.hour * 60 + now.minute;
    if (runMode === 'PREMARKET') return minutes < 4 * 60 || minutes > 9 * 60 + 30;
    if (runMode === 'AFTERMARKET') return minutes < 16 * 60 || minutes > 20 * 60;
    if (runMode === 'EXTENDED') return minutes < 4 * 60 || minutes > 20 * 60;
    return minutes < 9 * 60 + 30 || minutes > 16 * 60;
  }

  return false;
}

export async function checkWorkers(): Promise<AlertEvent[]> {
  const events: AlertEvent[] = [];
  const rows = (await fetchLatestWorkers()) as WorkerRow[];
  const byService = new Map(rows.map((r) => [r.service, r]));

  for (const cfg of MARKET_WORKERS) {
    if (!cfg.enabled) continue;
    const row = byService.get(cfg.service);

    if (!row) {
      events.push({
        level: 'CRIT',
        category: 'worker_missing',
        market: cfg.market,
        title: '워커 상태 없음',
        message: `worker_status에 ${cfg.service} 레코드가 없습니다.`,
        at: nowIso(),
        service: cfg.service,
      });
      continue;
    }

    // 장외/휴장 등 의도된 SKIPPED 상태는 알림 대상에서 제외한다.
    if (isSkippedState(row.state)) continue;
    if (isOutsideWindow(cfg.market, row.run_mode)) continue;

    const reference = row.last_success_at ?? row.last_event_at;
    if (!reference) {
      events.push({
        level: 'CRIT',
        category: 'worker_missing',
        market: cfg.market,
        title: '정상 수집 기록 없음',
        message: `마지막 성공/이벤트 기록이 없습니다. (state=${row.state})`,
        at: nowIso(),
        service: row.service,
        runMode: row.run_mode ?? undefined,
      });
      continue;
    }

    const lagMin = diffMinutes(reference, nowIso());
    const lvl = levelOfWorkerLag(lagMin);
    if (!lvl) continue;

    events.push({
      level: lvl,
      category: 'worker_lag',
      market: cfg.market,
      title: '워커 지연 감지',
      message: [
        `마지막 기록: ${toKstIso(reference)}`,
        `경과: ${lagMin.toFixed(1)}분`,
        `상태: ${row.state}`,
      ].join('\n'),
      at: nowIso(),
      service: row.service,
      runMode: row.run_mode ?? undefined,
    });
  }

  return events;
}
