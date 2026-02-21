import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { isAllowedEmail } from '@/lib/auth/allowed-emails';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signOutDashboardAction } from './actions';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();

  const email = data.user?.email ?? null;
  if (!data.user) {
    redirect('/login?next=%2Fdashboard%2Fcrypto');
  }

  if (!isAllowedEmail(email)) {
    redirect('/auth/logout?reason=forbidden');
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              트레이딩 모니터 대시보드
            </h1>
            <p className="pt-1 text-sm text-slate-600">Snapshot API 기반 실시간 모니터링</p>
            <p className="pt-1 text-xs text-slate-500">로그인: {email}</p>
          </div>

          <form action={signOutDashboardAction}>
            <Button type="submit" variant="outline">
              로그아웃
            </Button>
          </form>
        </header>
        {children}
      </div>
    </main>
  );
}
