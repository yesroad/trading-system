'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface LoginFormProps {
  appUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

function buildAppUrl(appUrl: string): string {
  return appUrl.trim();
}

function normalizeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/dashboard/crypto';
  if (raw.startsWith('//')) return '/dashboard/crypto';
  if (raw.startsWith('/auth/callback')) return '/dashboard/crypto';
  return raw;
}

function getErrorMessage(errorCode: string | null): string {
  if (!errorCode) return '';

  if (errorCode === 'forbidden') return '허용되지 않은 계정입니다.';
  if (errorCode === 'missing_code') return '로그인 콜백 코드가 누락되었습니다.';
  if (errorCode === 'exchange_failed') return '세션 생성에 실패했습니다. 다시 시도해주세요.';
  if (errorCode === 'oauth_error') return 'OAuth 로그인 처리 중 오류가 발생했습니다.';
  return '로그인 중 오류가 발생했습니다.';
}

export function LoginForm({ appUrl, supabaseUrl, supabaseAnonKey }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const errorCode = searchParams.get('error');
  const nextPath = normalizeNextPath(searchParams.get('next'));

  const errorMessage = useMemo(() => getErrorMessage(errorCode), [errorCode]);

  async function handleGoogleLogin() {
    setLoading(true);

    try {
      const effectiveAppUrl = buildAppUrl(appUrl);
      const redirectTo = new URL('/auth/callback', effectiveAppUrl);
      redirectTo.searchParams.set('next', nextPath);

      const supabase = createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectTo.toString(),
        },
      });

      if (error) {
        window.location.href = '/login?error=oauth_error';
      }
    } catch (error: unknown) {
      void error;
      window.location.href = '/login?error=oauth_error';
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">대시보드 로그인</h1>
        <p className="mt-2 text-sm text-slate-600">
          Google 계정으로 로그인 후 대시보드를 사용하세요.
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </p>
        ) : null}

        <Button className="mt-5 w-full" onClick={handleGoogleLogin} disabled={loading}>
          {loading ? '로그인 중...' : 'Google로 로그인'}
        </Button>
      </div>
    </div>
  );
}
