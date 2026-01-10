"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type TrackedSymbol = {
  id: number;
  symbol: string;
  name: string | null;
  broker: string;
  market: string;
  broker_code: string;
  is_active: boolean;
  poll_interval_ms: number;
};

export function TrackedSymbols() {
  const [rows, setRows] = useState<TrackedSymbol[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("tracked_symbols")
      .select("id,symbol,name,broker,market,broker_code,is_active,poll_interval_ms")
      .order("id", { ascending: true });

    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setRows((data ?? []) as TrackedSymbol[]);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-sm text-slate-500">추적 종목</div>
          <div className="text-lg font-semibold">tracked_symbols</div>
        </div>
        {errorMsg && <div className="text-sm text-red-600">{errorMsg}</div>}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">symbol</th>
              <th className="px-3 py-2 text-left">name</th>
              <th className="px-3 py-2 text-right">poll(ms)</th>
              <th className="px-3 py-2 text-center">active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{r.symbol}</td>
                <td className="px-3 py-2">{r.name ?? "-"}</td>
                <td className="px-3 py-2 text-right font-mono text-xs">{r.poll_interval_ms}</td>
                <td className="px-3 py-2 text-center">{r.is_active ? "ON" : "OFF"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={4}>
                  등록된 종목이 없습니다
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}