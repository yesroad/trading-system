import 'dotenv/config';
import { envNumber, envBoolean, requireEnv } from '@workspace/shared-utils';

function str(key: string, def: string) {
  const v = process.env[key];
  return v ? String(v) : def;
}

export const env = {
  WORKER_LAG_WARN_MIN: envNumber('WORKER_LAG_WARN_MIN', 3) ?? 3,
  WORKER_LAG_CRIT_MIN: envNumber('WORKER_LAG_CRIT_MIN', 10) ?? 10,

  INGESTION_STALE_WARN_MIN: envNumber('INGESTION_STALE_WARN_MIN', 3) ?? 3,
  INGESTION_STALE_CRIT_MIN: envNumber('INGESTION_STALE_CRIT_MIN', 10) ?? 10,
  INGESTION_RUNNING_WARN_MIN: envNumber('INGESTION_RUNNING_WARN_MIN', 3) ?? 3,
  INGESTION_RUNNING_CRIT_MIN: envNumber('INGESTION_RUNNING_CRIT_MIN', 10) ?? 10,

  AI_STALE_WARN_MIN: envNumber('AI_STALE_WARN_MIN', 30) ?? 30,
  AI_STALE_CRIT_MIN: envNumber('AI_STALE_CRIT_MIN', 120) ?? 120,

  ALERT_COOLDOWN_MIN: envNumber('ALERT_COOLDOWN_MIN', 10) ?? 10,
  ALERT_PREFIX: process.env.ALERT_PREFIX ?? '[TRADING]',

  ENABLE_KR: envBoolean('ENABLE_KR', true),
  ENABLE_US: envBoolean('ENABLE_US', true),
  ENABLE_CRYPTO: envBoolean('ENABLE_CRYPTO', true),

  TELEGRAM_BOT_TOKEN: requireEnv('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: requireEnv('TELEGRAM_CHAT_ID'),

  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_KEY: requireEnv('SUPABASE_KEY'),

  CRIT_REPEAT_ENABLED: envBoolean('CRIT_REPEAT_ENABLED', true),
  CRIT_REPEAT_DELAY_SEC: envNumber('CRIT_REPEAT_DELAY_SEC', 10) ?? 10,

  DAILY_REPORT_ENABLED: envBoolean('DAILY_REPORT_ENABLED', false),
  DAILY_REPORT_TITLE: str('DAILY_REPORT_TITLE', '[TRADING] 하루 요약'),
};
