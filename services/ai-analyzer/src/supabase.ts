import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './config/env';

export const supabase: SupabaseClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);
