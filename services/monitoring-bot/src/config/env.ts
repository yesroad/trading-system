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

  ALERT_COOLDOWN_MIN: num('ALERT_COOLDOWN_MIN', 10),
  ALERT_PREFIX: process.env.ALERT_PREFIX ?? '[TRADING]',

  ENABLE_KR: bool('ENABLE_KR', true),
  ENABLE_US: bool('ENABLE_US', true),
  ENABLE_CRYPTO: bool('ENABLE_CRYPTO', true),

  TELEGRAM_BOT_TOKEN: req('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_CHAT_ID: req('TELEGRAM_CHAT_ID'),

  SUPABASE_URL: req('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: req('SUPABASE_SERVICE_ROLE_KEY'),

  INGESTION_RUNNING_WARN_MIN: num('TELEGRAM_BOT_TOKEN', 3),
  INGESTION_RUNNING_CRIT_MIN: num('TELEGRAM_CHAT_ID', 10),

  CRIT_REPEAT_ENABLED: req('CRIT_REPEAT_ENABLED'),
  CRIT_REPEAT_DELAY_SEC: num('TELEGRAM_CHAT_ID', 10),

  DAILY_REPORT_ENABLED: req('DAILY_REPORT_ENABLED'),
  DAILY_REPORT_TITLE: str('TELEGRAM_CHAT_ID', '[TRADING] 하루 요약'),
};
