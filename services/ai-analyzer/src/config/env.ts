import '@workspace/shared-utils/env-loader';
import { requireEnv, envBoolean, envNumber, env as readEnv } from '@workspace/shared-utils';

export type AiRunMode = 'MARKET' | 'PREMARKET' | 'AFTERMARKET' | 'EXTENDED' | 'NO_CHECK';

function parseAiRunMode(raw: string | undefined): AiRunMode {
  const normalized = raw?.trim().toUpperCase();
  if (!normalized || normalized === 'MARKET_ONLY' || normalized === 'MARKET') return 'MARKET';
  if (normalized === 'PREMARKET') return 'PREMARKET';
  if (normalized === 'AFTERMARKET') return 'AFTERMARKET';
  if (normalized === 'EXTENDED') return 'EXTENDED';
  if (normalized === 'NO_CHECK' || normalized === 'ALWAYS') return 'NO_CHECK';
  throw new Error(
    `AI_RUN_MODE must be one of MARKET|PREMARKET|AFTERMARKET|EXTENDED|NO_CHECK, got: ${raw}`,
  );
}

const AI_DAILY_LIMIT_BASE = envNumber('AI_DAILY_LIMIT', 2000) ?? 2000;

export const env = {
  /** ===============================
   * AI 활성화 여부 (시장별)
   * =============================== */
  AI_ENABLE_KR: envBoolean('AI_ENABLE_KR', false),
  AI_ENABLE_US: envBoolean('AI_ENABLE_US', false),
  AI_ENABLE_CRYPTO: envBoolean('AI_ENABLE_CRYPTO', false),

  /** ===============================
   * AI 실행 제어
   * =============================== */
  AI_RUN_MODE: parseAiRunMode(readEnv('AI_RUN_MODE')),
  AI_MAX_TARGETS_PER_MARKET: envNumber('AI_MAX_TARGETS_PER_MARKET', 30) ?? 30,
  AI_CALL_INTERVAL_MINUTES: envNumber('AI_CALL_INTERVAL_MINUTES', 30) ?? 30,
  AI_GATE_TIME_TOLERANCE_MIN: envNumber('AI_GATE_TIME_TOLERANCE_MIN', 5) ?? 5,
  AI_GATE_TARGET_SCAN_LIMIT: envNumber('AI_GATE_TARGET_SCAN_LIMIT', 20) ?? 20,

  /** ===============================
   * AI 예산 제어
   * =============================== */
  AI_HOURLY_LIMIT: envNumber('AI_HOURLY_LIMIT', 120) ?? 120,
  AI_DAILY_LIMIT: AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_CRYPTO:
    envNumber('AI_DAILY_LIMIT_CRYPTO', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_KRX: envNumber('AI_DAILY_LIMIT_KRX', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_DAILY_LIMIT_US: envNumber('AI_DAILY_LIMIT_US', AI_DAILY_LIMIT_BASE) ?? AI_DAILY_LIMIT_BASE,
  AI_MONTHLY_BUDGET_USD: envNumber('AI_MONTHLY_BUDGET_USD', 10) ?? 10,

  /** ===============================
   * 시장별 호출 트리거
   * =============================== */
  AI_CRYPTO_RETURN_5M_PCT: envNumber('AI_CRYPTO_RETURN_5M_PCT', 0.8) ?? 0.8,
  AI_CRYPTO_VOLUME_SPIKE_X: envNumber('AI_CRYPTO_VOLUME_SPIKE_X', 2.2) ?? 2.2,
  AI_KRX_RETURN_5M_PCT: envNumber('AI_KRX_RETURN_5M_PCT', 0.45) ?? 0.45,
  AI_KRX_VOLUME_SPIKE_X: envNumber('AI_KRX_VOLUME_SPIKE_X', 2.2) ?? 2.2,
  AI_US_RETURN_15M_PCT: envNumber('AI_US_RETURN_15M_PCT', 1.8) ?? 1.8,
  AI_US_VOLUME_SPIKE_X: envNumber('AI_US_VOLUME_SPIKE_X', 3.0) ?? 3.0,
  AI_US_VOLATILITY_TOP_PERCENT: envNumber('AI_US_VOLATILITY_TOP_PERCENT', 15) ?? 15,
  AI_US_HEARTBEAT_HOURS: envNumber('AI_US_HEARTBEAT_HOURS', 2) ?? 2,

  /** ===============================
   * LLM 설정
   * =============================== */
  OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),
  AI_MODEL: requireEnv('AI_MODEL'),

  /** ===============================
   * supabase 설정
   * =============================== */
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_KEY: requireEnv('SUPABASE_KEY'),
} as const;

export type Env = typeof env;
