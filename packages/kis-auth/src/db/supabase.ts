/**
 * Supabase 클라이언트 설정
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[kis-auth] 환경변수 누락: ${name}`);
    throw new Error(`${name} is missing`);
  }
  return v;
}

const SUPABASE_URL = getEnv('SUPABASE_URL');
const SUPABASE_KEY = getEnv('SUPABASE_KEY');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('[kis-auth] Supabase 클라이언트 초기화 완료');
