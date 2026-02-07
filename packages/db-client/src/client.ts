import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from '@workspace/shared-utils';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const url = requireEnv('SUPABASE_URL');
    const key = requireEnv('SUPABASE_KEY');
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

export function resetSupabaseClient(): void {
  supabaseInstance = null;
}
