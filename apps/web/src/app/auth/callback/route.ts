import { NextResponse } from 'next/server';
import { isAllowedEmail } from '@/lib/auth/allowed-emails';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function normalizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/dashboard/crypto';
  if (raw.startsWith('//')) return '/dashboard/crypto';
  if (raw.startsWith('/auth/callback')) return '/dashboard/crypto';
  return raw;
}

function toLoginErrorRedirect(origin: string, code: string): NextResponse {
  const url = new URL('/login', origin);
  url.searchParams.set('error', code);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const oauthError = reqUrl.searchParams.get('error');
  const nextPath = normalizeNextPath(reqUrl.searchParams.get('next'));

  if (oauthError) {
    return toLoginErrorRedirect(reqUrl.origin, 'oauth_error');
  }

  if (!code) {
    return toLoginErrorRedirect(reqUrl.origin, 'missing_code');
  }

  const supabase = await createSupabaseServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return toLoginErrorRedirect(reqUrl.origin, 'exchange_failed');
  }

  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? null;
  if (!data.user || !isAllowedEmail(email)) {
    await supabase.auth.signOut();
    return toLoginErrorRedirect(reqUrl.origin, 'forbidden');
  }

  return NextResponse.redirect(new URL(nextPath, reqUrl.origin));
}
