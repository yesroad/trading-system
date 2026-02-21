import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { envServer } from '@/lib/env.server';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    envServer('NEXT_PUBLIC_SUPABASE_URL'),
    envServer('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options as CookieOptions);
            });
          } catch (error: unknown) {
            // Server Component 렌더링 컨텍스트에서는 cookie set이 불가능할 수 있다.
            void error;
          }
        },
      },
    },
  );
}
