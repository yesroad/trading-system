export type AlertLevel = 'OK' | 'WARN' | 'CRIT';
export type AlertMarket = 'KR' | 'US' | 'CRYPTO' | 'GLOBAL';
export type AlertCategory =
  | 'worker_missing'
  | 'worker_lag'
  | 'worker_state'
  | 'ingestion_running'
  | 'ingestion_stale'
  | 'ingestion_missing'
  | 'ai_missing'
  | 'ai_stale'
  | 'notification_event';

export type AlertEvent = {
  level: AlertLevel;
  category: AlertCategory;
  market: AlertMarket;
  title: string;
  message: string;
  at: string;
  service?: string;
  runMode?: string;
};

export const LEVEL_EMOJI: Record<AlertLevel, string> = {
  OK: '✅',
  WARN: '⚠️',
  CRIT: '🔥',
};
