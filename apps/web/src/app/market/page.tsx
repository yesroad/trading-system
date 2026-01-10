"use client";

import { useEffect, useState } from "react";
import { getLatestBars } from "@/services/market/getLatestBars";
import { getRecentIngestionRuns } from "@/services/market/getRecentIngestionRuns";
import { supabase } from "@/lib/supabase";

const SYMBOLS = ["AAPL", "TSLA"];

type WorkerStatus = {
  service: string;
  run_mode: string;
  state: string;
  last_event_at: string | null;
  last_success_at: string | null;
  message: string | null;
  updated_at: string;
};

async function fetchWorkerStatus() {
  const { data, error } = await supabase
    .from("worker_status")
    .select("service,run_mode,state,last_event_at,last_success_at,message,updated_at")
    .eq("service", "yf-collector")
    .single();

  if (error) throw new Error(error.message);
  return data as WorkerStatus;
}

export default function MarketPage() {
  const [bars, setBars] = useState<Map<string, any[]> | null>(null);
  const [runs, setRuns] = useState<any[] | null>(null);
  const [worker, setWorker] = useState<WorkerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  function minutesLag(ts: string | null | undefined) {
    if (!ts) return null;
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return null;
    const diffMs = Date.now() - t;
    const m = Math.floor(diffMs / 60000);
    return m >= 0 ? m : 0;
  }

  function statusBadgeClass(state?: string) {
    switch (state) {
      case "success":
        return "border-emerald-200 bg-emerald-50 text-emerald-700";
      case "failed":
        return "border-red-200 bg-red-50 text-red-700";
      case "running":
        return "border-blue-200 bg-blue-50 text-blue-700";
      case "skipped":
        return "border-amber-200 bg-amber-50 text-amber-700";
      default:
        return "border-slate-200 bg-slate-50 text-slate-700";
    }
  }

  function lagBadgeClass(lagMin: number | null) {
    if (lagMin === null) return "border-slate-200 bg-slate-50 text-slate-700";
    if (lagMin <= 2) return "border-emerald-200 bg-emerald-50 text-emerald-700";
    if (lagMin <= 10) return "border-amber-200 bg-amber-50 text-amber-700";
    return "border-red-200 bg-red-50 text-red-700";
  }

  function worstLagMinutes() {
    // 현재 화면에서 보는 SYMBOLS 중 최신 봉 기준 최악(가장 큰) 지연(분)
    if (!bars) return null;

    let worst: number | null = null;
    for (const s of SYMBOLS) {
      const list = bars.get(s) ?? [];
      const latest = list[0];
      const lag = minutesLag(latest?.ts);
      if (lag === null) continue;
      if (worst === null || lag > worst) worst = lag;
    }
    return worst;
  }

  async function load() {
    try {
      setError(null);
      const [b, r, w] = await Promise.all([
        getLatestBars({ symbols: SYMBOLS, timeframe: "1m", limitPerSymbol: 20 }),
        getRecentIngestionRuns({ limit: 10 }),
        fetchWorkerStatus(),
      ]);
      setBars(b);
      setRuns(r);
      setWorker(w);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, []);

  const worstLag = worstLagMinutes();

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm text-slate-500">2편</div>
          <h1 className="text-2xl font-bold">해외주식 배치 수집 모니터링</h1>
          <p className="text-sm text-slate-500 mt-1">
            Yahoo Chart API (1m) / 15분 배치 저장 결과 확인
          </p>
        </div>

        <button
          onClick={() => void load()}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
        >
          새로고침
        </button>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="font-semibold">워커 상태</div>
          <div className="text-xs text-slate-500">
            업데이트: {worker?.updated_at ? new Date(worker.updated_at).toLocaleString() : "-"}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full border px-3 py-1 border-slate-200 bg-white text-slate-700">
            모드: <span className="font-semibold">{worker?.run_mode ?? "-"}</span>
          </span>

          <span className={`rounded-full border px-3 py-1 ${statusBadgeClass(worker?.state)}`}>
            상태:{" "}
            <span className="font-semibold">
              {worker?.state === "success"
                ? "정상"
                : worker?.state === "failed"
                  ? "실패"
                  : worker?.state === "running"
                    ? "수집중"
                    : worker?.state === "skipped"
                      ? "스킵"
                      : "-"}
            </span>
          </span>

          <span
            className={`rounded-full border px-3 py-1 ${lagBadgeClass(worstLag)}`}
            title="현재 화면의 심볼들(AAPL/TSLA) 중 최신 봉 기준 가장 느린 지연(분)"
          >
            데이터 지연: <span className="font-semibold">{worstLag === null ? "-" : `${worstLag}분`}</span>
          </span>

          <span className="rounded-full border px-3 py-1 border-slate-200 bg-slate-50 text-slate-700">
            최근 정상 수집:{" "}
            <span className="font-semibold">
              {worker?.last_success_at ? new Date(worker.last_success_at).toLocaleString() : "-"}
            </span>
          </span>

          <span className="rounded-full border px-3 py-1 border-slate-200 bg-slate-50 text-slate-700">
            사유/메시지: <span className="font-semibold">{worker?.message ?? "-"}</span>
          </span>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      )}

      {/* 최신 봉(심볼별) */}
      <section className="rounded-xl border bg-white p-4">
        <div className="font-semibold">최근 봉(각 20개)</div>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {SYMBOLS.map((s) => {
            const list = bars?.get(s) ?? [];
            const latest = list[0];

            return (
              <div key={s} className="rounded-xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="text-lg font-bold">{s}</div>

                    {(() => {
                      const lag = minutesLag(latest?.ts);
                      return (
                        <span
                          className={`rounded-full border px-2 py-0.5 text-xs ${lagBadgeClass(lag)}`}
                          title={latest?.ts ? `최신 봉 시각: ${new Date(latest.ts).toLocaleString()}` : ""}
                        >
                          지연: {lag === null ? "-" : `${lag}분`}
                        </span>
                      );
                    })()}
                  </div>

                  <div className="text-xs text-slate-500">
                    최신: {latest ? new Date(latest.ts).toLocaleString() : "-"}
                  </div>
                </div>

                <div className="mt-2 text-sm text-slate-700">
                  종가:{" "}
                  <span className="font-semibold">
                    {latest?.close != null ? Number(latest.close).toFixed(2) : "-"}
                  </span>
                  <span className="text-slate-400 ml-2">
                    (고: {latest?.high ?? "-"} / 저: {latest?.low ?? "-"})
                  </span>
                </div>

                <div className="mt-3 max-h-56 overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="text-left text-slate-500">
                        <th className="p-2">시간</th>
                        <th className="p-2">종가</th>
                        <th className="p-2">거래량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map((r: any) => (
                        <tr key={r.ts} className="border-t">
                          <td className="p-2">{new Date(r.ts).toLocaleTimeString()}</td>
                          <td className="p-2">{r.close ?? "-"}</td>
                          <td className="p-2">{r.volume ?? "-"}</td>
                        </tr>
                      ))}
                      {list.length === 0 && (
                        <tr>
                          <td className="p-2 text-slate-500" colSpan={3}>
                            데이터 없음
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ingestion_runs */}
      <section className="rounded-xl border bg-white p-4">
        <div className="font-semibold">최근 배치 실행(ingestion_runs)</div>

        <div className="mt-3 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-white">
              <tr className="text-left text-slate-500">
                <th className="p-2">시작</th>
                <th className="p-2">상태</th>
                <th className="p-2">insert</th>
                <th className="p-2">심볼</th>
                <th className="p-2">비고</th>
              </tr>
            </thead>
            <tbody>
              {(runs ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="p-2">
                    {r.status === "success" ? "성공" : r.status === "failed" ? "실패" : "진행중"}
                  </td>
                  <td className="p-2">{r.inserted_count}</td>
                  <td className="p-2">{Array.isArray(r.symbols) ? r.symbols.join(", ") : "-"}</td>
                  <td className="p-2 text-slate-500 truncate max-w-[360px]">
                    {r.status === "failed" ? r.error_message : "-"}
                  </td>
                </tr>
              ))}

              {(runs ?? []).length === 0 && (
                <tr>
                  <td className="p-2 text-slate-500" colSpan={5}>
                    실행 기록 없음
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}