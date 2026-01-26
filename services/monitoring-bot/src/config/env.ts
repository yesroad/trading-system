import 'dotenv/config';

function num(key: string, def: number) {
  const v = process.env[key];
  return v ? Number(v) : def;
}
function bool(key: string, def = false) {
  const v = process.env[key];
  return v ? v === 'true' : def;
}

function str(key: string, def: string) {
  const v = process.env[key];
  return v ? String(v) : def;
}

function req(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`ENV 누락: ${key}`);
  return v;
}

export const env = {
  WORKER_LAG_WARN_MIN: num('WORKER_LAG_WARN_MIN', 3),
  WORKER_LAG_CRIT_MIN: num('WORKER_LAG_CRIT_MIN', 10),

  INGESTION_STALE_WARN_MIN: num('INGESTION_STALE_WARN_MIN', 3),
  INGESTION_STALE_CRIT_MIN: num('INGESTION_STALE_CRIT_MIN', 10),
  INGESTION_RUNNING_WARN_MIN: num('INGESTION_RUNNING_WARN_MIN', 3),
  INGESTION_RUNNING_CRIT_MIN: num('INGESTION_RUNNING_CRIT_MIN', 10),

  AI_STALE_WARN_MIN: num('AI_STALE_WARN_MIN', 30),
  AI_STALE_CRIT_MIN: num('AI_STALE_CRIT_MIN', 120),

  ALERT_COOLDOWN_MIN: num('ALERT_COOLDOWN_MIN', 10),
  ALERT_PREFIX: process.env.ALERT_PREFIX ?? '[TRADING]',

  ENABLE_KR: bool('ENABLE_KR', true),
  ENABLE_US: bool('ENABLE_US', true),
  ENABLE_CRYPTO: bool('ENABLE_CRYPTO', true),

  TELEGRAM_BOT_TOKEN: req('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: req('TELEGRAM_CHAT_ID'),

  SUPABASE_URL: req('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),

  CRIT_REPEAT_ENABLED: bool('CRIT_REPEAT_ENABLED', true),
  CRIT_REPEAT_DELAY_SEC: num('CRIT_REPEAT_DELAY_SEC', 10),

  DAILY_REPORT_ENABLED: bool('DAILY_REPORT_ENABLED', false),
  DAILY_REPORT_TITLE: str('DAILY_REPORT_TITLE', '[TRADING] 하루 요약'),
};
