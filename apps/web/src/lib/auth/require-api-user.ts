import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { isAllowedEmail } from '@/lib/auth/allowed-emails';
import { createSupabaseServerClient } from '@/lib/supabase/server';

function unauthorizedResponse() {
  return NextResponse.json(
    {
      error: {
        code: 'UNAUTHORIZED',
        message: '로그인이 필요합니다.',
      },
    },
    { status: 401 },
  );
}

function forbiddenResponse() {
  return NextResponse.json(
    {
      error: {
        code: 'FORBIDDEN',
        message: '허용되지 않은 계정입니다.',
      },
    },
    { status: 403 },
  );
}

export async function requireApiUser(): Promise<{ user: User } | NextResponse> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return unauthorizedResponse();
  }

  const email = data.user.email;
  if (!isAllowedEmail(email)) {
    await supabase.auth.signOut();
    return forbiddenResponse();
  }

  return { user: data.user };
}
