import 'dotenv/config';

type EnvKey =
  | 'SUPABASE_URL'
  | 'SUPABASE_SERVICE_ROLE_KEY'
  | 'WORKER_SERVICE_NAME'
  | 'LOOP_INTERVAL_MS'
  | 'UPBIT_TIMEFRAME'
  | 'UPBIT_TOP_N'
  | 'UPBIT_SCAN_INTERVAL_MS'
  | 'UPBIT_CANDLE_LIMIT';

function required(key: EnvKey): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`환경변수 누락: ${key}`);
  }
  return v;
}

function optional(key: EnvKey, fallback: string): string {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v : fallback;
}

export const env = {
  SUPABASE_URL: required('SUPABASE_URL'),
  SUPABASE_SERVICE_ROLE_KEY: required('SUPABASE_SERVICE_ROLE_KEY'),

  WORKER_SERVICE_NAME: optional('WORKER_SERVICE_NAME', 'upbit-collector'),

  LOOP_INTERVAL_MS: Number(optional('LOOP_INTERVAL_MS', '10000')),
  UPBIT_TIMEFRAME: optional('UPBIT_TIMEFRAME', '1m'),
  UPBIT_TOP_N: Number(optional('UPBIT_TOP_N', '30')),
  UPBIT_SCAN_INTERVAL_MS: Number(optional('UPBIT_SCAN_INTERVAL_MS', '60000')),
  UPBIT_CANDLE_LIMIT: Number(optional('UPBIT_CANDLE_LIMIT', '3')),
} as const;

function assertNumbers() {
  const nums: Array<[string, number]> = [
    ['LOOP_INTERVAL_MS', env.LOOP_INTERVAL_MS],
    ['UPBIT_TOP_N', env.UPBIT_TOP_N],
    ['UPBIT_SCAN_INTERVAL_MS', env.UPBIT_SCAN_INTERVAL_MS],
    ['UPBIT_CANDLE_LIMIT', env.UPBIT_CANDLE_LIMIT],
  ];
  for (const [k, v] of nums) {
    if (!Number.isFinite(v) || v <= 0) {
      throw new Error(`환경변수 값이 잘못되었습니다: ${k}=${String(v)}`);
    }
  }
}
assertNumbers();
