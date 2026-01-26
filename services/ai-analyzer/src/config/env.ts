import 'dotenv/config';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[ENV] 필수 환경변수 누락: ${key}`);
  }
  return value;
}

function optionalBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true';
}

function optionalNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`[ENV] 숫자 형식 오류: ${key}=${value}`);
  }
  return num;
}

export const env = {
  /** ===============================
   * AI 활성화 여부 (시장별)
   * =============================== */
  AI_ENABLE_KR: optionalBoolean('AI_ENABLE_KR', false),
  AI_ENABLE_US: optionalBoolean('AI_ENABLE_US', false),
  AI_ENABLE_CRYPTO: optionalBoolean('AI_ENABLE_CRYPTO', false),

  /** ===============================
   * AI 실행 제어
   * =============================== */
  AI_MAX_TARGETS_PER_MARKET: optionalNumber('AI_MAX_TARGETS_PER_MARKET', 30),

  /** ===============================
   * LLM 설정
   * =============================== */
  OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),
  AI_MODEL: requireEnv('AI_MODEL'),

  /** ===============================
   * supabase 설정
   * =============================== */
  SUPABASE_URL: requireEnv('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
} as const;

export type Env = typeof env;
