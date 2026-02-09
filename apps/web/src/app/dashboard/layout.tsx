export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <header className="mb-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            트레이딩 모니터 대시보드
          </h1>
          <p className="pt-1 text-sm text-slate-600">Snapshot API 기반 실시간 모니터링</p>
        </header>
        {children}
      </div>
    </main>
  );
}
