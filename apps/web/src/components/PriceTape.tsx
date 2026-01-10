"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type TickRow = {
  id: number;
  symbol: string;
  ts: string;
  price: number;
  raw: unknown;
  created_at: string;
};

const SYMBOL = "KRX:005930";
const LIMIT = 50;

/**
 * 실시간 가격 테이프
 * - DB 최신 N개 로드
 * - INSERT realtime 구독으로 화면 갱신
 */
export function PriceTape() {
  const [rows, setRows] = useState<TickRow[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const latest = useMemo(() => rows[0], [rows]);

  useEffect(() => {
    let isMounted = true;

    async function init() {
      setStatus("loading");

      // 1) 최신 데이터 로드
      const { data, error } = await supabase
        .from("kis_price_ticks")
        .select("id,symbol,ts,price,raw,created_at")
        .eq("symbol", SYMBOL)
        .order("ts", { ascending: false })
        .limit(LIMIT);

      if (!isMounted) return;

      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }

      setRows((data ?? []) as TickRow[]);
      setStatus("live");

      // 2) 실시간 INSERT 구독
      // 주의: RLS가 켜져있으면 anon은 읽기/구독이 막힐 수 있음 -> 아래 RLS 단계 참고
      const channel = supabase
        .channel("realtime:kis_price_ticks")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "kis_price_ticks",
            filter: `symbol=eq.${SYMBOL}`,
          },
          (payload) => {
            const newRow = payload.new as TickRow;

            setRows((prev) => {
              const next = [newRow, ...prev];

              // 중복 방지(혹시 초기 fetch와 겹치는 케이스 대비)
              const dedup = new Map<number, TickRow>();
              for (const r of next) dedup.set(r.id, r);

              return Array.from(dedup.values())
                .sort((a, b) => (a.ts < b.ts ? 1 : -1))
                .slice(0, LIMIT);
            });
          },
        )
        .subscribe((s) => {
          // subscribed / timed out / error 등
          if (s === "SUBSCRIBED") setStatus("live");
        });

      return () => {
        supabase.removeChannel(channel);
      };
    }

    const cleanupPromise = init();

    return () => {
      isMounted = false;
      // init() 안에서 반환한 cleanup이 있으면 실행
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      cleanupPromise?.then((cleanup) => cleanup?.());
    };
  }, []);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">실시간 테이프</div>
          <div className="text-lg font-semibold">{SYMBOL}</div>
        </div>

        <div className="text-right">
          <div className="text-sm text-slate-500">최근 가격</div>
          <div className="text-2xl font-bold tabular-nums">
            {latest ? latest.price.toLocaleString() : "-"}
          </div>
          <div className="text-xs text-slate-500">
            {status === "loading" && "로딩 중..."}
            {status === "live" && "LIVE"}
            {status === "error" && `에러: ${errorMsg ?? "unknown"}`}
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">시간(ts)</th>
              <th className="px-3 py-2 text-right">가격</th>
              <th className="px-3 py-2 text-left">created_at</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{new Date(r.ts).toLocaleTimeString()}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">
                  {Number(r.price).toLocaleString()}
                </td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">
                  {new Date(r.created_at).toLocaleTimeString()}
                </td>
              </tr>
            ))}
            {rows.length === 0 && status !== "loading" && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={3}>
                  데이터가 없습니다 (워커가 insert 중인지 확인)
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}