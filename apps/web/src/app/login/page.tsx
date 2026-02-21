import { redirect } from 'next/navigation';
import { isAllowedEmail } from '@/lib/auth/allowed-emails';
import { envOptionalServer, envServer } from '@/lib/env.server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  const email = data.user?.email ?? null;
  if (data.user && isAllowedEmail(email)) {
    redirect('/dashboard/crypto');
  }

  if (data.user && !isAllowedEmail(email)) {
    redirect('/auth/logout?reason=forbidden');
  }

  const appUrl = envOptionalServer('NEXT_PUBLIC_APP_URL') ?? null;
  const supabaseUrl = envServer('NEXT_PUBLIC_SUPABASE_URL');
  const supabaseAnonKey = envServer('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 px-4 py-8">
      <LoginForm appUrl={appUrl} supabaseUrl={supabaseUrl} supabaseAnonKey={supabaseAnonKey} />
    </main>
  );
}
