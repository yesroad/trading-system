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
  | 'ai_budget_hourly_limit'
  | 'ai_budget_daily_limit'
  | 'ai_budget_monthly_80'
  | 'ai_budget_monthly_limit'
  | 'notification_event'
  | 'trading_signals_error'
  | 'trading_signals_stale'
  | 'risk_events_error'
  | 'circuit_breaker'
  | 'leverage_violation'
  | 'exposure_limit'
  | 'trades_error'
  | 'trades_high_failure'
  | 'trades_no_ace'
  | 'signal_failures_error'
  | 'signal_failure_rate_high'
  | 'monitoring_runtime_error';

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
