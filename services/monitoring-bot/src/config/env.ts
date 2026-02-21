import '@workspace/shared-utils/env-loader';
import { env as readEnv, envNumber, envBoolean, requireEnv } from '@workspace/shared-utils';

function str(key: string, def: string) {
  const v = readEnv(key);
  return v ? String(v) : def;
}

export type MonitoringRunMode = 'MARKET' | 'PREMARKET' | 'AFTERMARKET' | 'EXTENDED' | 'NO_CHECK';
export type ExecuteMarket = 'CRYPTO' | 'KRX' | 'US';

function parseMonitoringRunMode(raw: string | undefined): MonitoringRunMode {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized || normalized === 'MARKET_ONLY' || normalized === 'MARKET') return 'MARKET';
  if (normalized === 'PREMARKET') return 'PREMARKET';
  if (normalized === 'AFTERMARKET') return 'AFTERMARKET';
  if (normalized === 'EXTENDED') return 'EXTENDED';
  if (normalized === 'NO_CHECK' || normalized === 'ALWAYS') return 'NO_CHECK';
  throw new Error(
    `MONITORING_RUN_MODE must be one of MARKET|PREMARKET|AFTERMARKET|EXTENDED|NO_CHECK, got: ${raw}`,
  );
}

function parseExecuteMarkets(raw: string | undefined): ExecuteMarket[] {
  if (!raw) return ['CRYPTO', 'KRX', 'US'];

  const out = new Set<ExecuteMarket>();
  for (const token of raw.split(',')) {
    const normalized = token.trim().toUpperCase();
    if (!normalized) continue;

    if (normalized === 'CRYPTO') {
      out.add('CRYPTO');
      continue;
    }
    if (normalized === 'KRX' || normalized === 'KR') {
      out.add('KRX');
      continue;
    }
    if (normalized === 'US') {
      out.add('US');
    }
  }

  return out.size > 0 ? [...out] : ['CRYPTO', 'KRX', 'US'];
}

const AI_DAILY_LIMIT_BASE = envNumber('AI_DAILY_LIMIT', 2000) ?? 2000;

export const env = {
  WORKER_LAG_WARN_MIN: envNumber('WORKER_LAG_WARN_MIN', 3) ?? 3,
  WORKER_LAG_CRIT_MIN: envNumber('WORKER_LAG_CRIT_MIN', 10) ?? 10,

  INGESTION_STALE_WARN_MIN: envNumber('INGESTION_STALE_WARN_MIN', 3) ?? 3,
  INGESTION_STALE_CRIT_MIN: envNumber('INGESTION_STALE_CRIT_MIN', 10) ?? 10,
  INGESTION_RUNNING_WARN_MIN: envNumber('INGESTION_RUNNING_WARN_MIN', 3) ?? 3,
  INGESTION_RUNNING_CRIT_MIN: envNumber('INGESTION_RUNNING_CRIT_MIN', 10) ?? 10,

  AI_STALE_WARN_MIN: envNumber('AI_STALE_WARN_MIN', 30) ?? 30,
  AI_STALE_CRIT_MIN: envNumber('AI_STALE_CRIT_MIN', 120) ?? 120,
  AI_HOURLY_LIMIT: envNumber('AI_HOURLY_LIMIT', 120) ?? 120,
  AI_DAILY_LIMIT: AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_CRYPTO:
    envNumber('AI_DAILY_LIMIT_CRYPTO', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_KRX: envNumber('AI_DAILY_LIMIT_KRX', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_US: envNumber('AI_DAILY_LIMIT_US', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_MONTHLY_BUDGET_USD: envNumber('AI_MONTHLY_BUDGET_USD', 10) ?? 10,

  ALERT_COOLDOWN_MIN: envNumber('ALERT_COOLDOWN_MIN', 10) ?? 10,
  ALERT_PREFIX: readEnv('ALERT_PREFIX') ?? '[TRADING]',

  ENABLE_KR: envBoolean('ENABLE_KR', true),
  ENABLE_US: envBoolean('ENABLE_US', true),
  ENABLE_CRYPTO: envBoolean('ENABLE_CRYPTO', true),
  LOOP_MODE: envBoolean('LOOP_MODE', true),
  EXECUTE_MARKETS: parseExecuteMarkets(readEnv('EXECUTE_MARKETS')),
  MONITORING_RUN_MODE: parseMonitoringRunMode(readEnv('MONITORING_RUN_MODE')),

  TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: requireEnv('TELEGRAM_CHAT_ID'),

  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_KEY: requireEnv('SUPABASE_KEY'),

  CRIT_REPEAT_ENABLED: envBoolean('CRIT_REPEAT_ENABLED', true),
  CRIT_REPEAT_DELAY_SEC: envNumber('CRIT_REPEAT_DELAY_SEC', 10) ?? 10,

  DAILY_REPORT_ENABLED: envBoolean('DAILY_REPORT_ENABLED', false),
  DAILY_REPORT_TITLE: str('DAILY_REPORT_TITLE', '[TRADING] 하루 요약'),

  NOTIFICATION_EVENTS_ENABLED: envBoolean('NOTIFICATION_EVENTS_ENABLED', true),
  NOTIFICATION_EVENTS_LIMIT: envNumber('NOTIFICATION_EVENTS_LIMIT', 50) ?? 50,
};
