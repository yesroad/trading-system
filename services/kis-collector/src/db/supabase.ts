import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@workspace/shared-utils';

/**
 * 서버/워커용 Supabase 클라이언트
 * - Service Role Key 사용 (절대 웹으로 노출 금지)
 */
export const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_KEY'));
