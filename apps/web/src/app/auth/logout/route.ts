import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

function normalizeReason(raw: string | null): string {
  if (raw === 'forbidden') return 'forbidden';
  return '';
}

export async function GET(req: Request) {
  const reqUrl = new URL(req.url);
  const reason = normalizeReason(reqUrl.searchParams.get('reason'));

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();

  const loginUrl = new URL('/login', reqUrl.origin);
  if (reason) {
    loginUrl.searchParams.set('error', reason);
  }

  return NextResponse.redirect(loginUrl);
}
