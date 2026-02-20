/**
 * Supabase 클라이언트 설정
 */

import { createClient } from '@supabase/supabase-js';
import '@workspace/shared-utils/env-loader';
import { requireEnv } from '@workspace/shared-utils';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_KEY = requireEnv('SUPABASE_KEY');

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log('[kis-auth] Supabase 클라이언트 초기화 완료');
