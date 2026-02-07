import 'dotenv/config';
import { requireEnv, envBoolean, envNumber } from '@workspace/shared-utils';

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
  AI_MAX_TARGETS_PER_MARKET: envNumber('AI_MAX_TARGETS_PER_MARKET', 30) ?? 30,

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
