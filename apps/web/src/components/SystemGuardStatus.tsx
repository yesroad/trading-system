"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type SystemGuard = {
  id: number;
  trading_enabled: boolean;
  error_count: number;
  last_error_at: string | null;
  updated_at: string;

  token_cooldown_count: number;
  token_cooldown_until: string | null;
  last_token_cooldown_at: string | null;

  last_success_at: string | null;
  last_success_symbol: string | null;
  last_success_price: number | null;
};

export function SystemGuardStatus() {
  const [guard, setGuard] = useState<SystemGuard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  async function load() {
    const { data, error } = await supabase
      .from("system_guard")
      .select(
        "id,trading_enabled,error_count,last_error_at,updated_at,token_cooldown_count,token_cooldown_until,last_token_cooldown_at,last_success_at,last_success_symbol,last_success_price"
      )
      .eq("id", 1)
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    setError(null);
    setGuard(data as SystemGuard);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const cooldown = useMemo(() => {
    if (!guard?.token_cooldown_until) return { active: false, sec: 0 };
    const until = new Date(guard.token_cooldown_until).getTime();
    const remainMs = until - nowTick;
    if (remainMs <= 0) return { active: false, sec: 0 };
    return { active: true, sec: Math.ceil(remainMs / 1000) };
  }, [guard?.token_cooldown_until, nowTick]);

  if (error) {
    return (
      <div className="rounded-xl border p-4 text-red-600">
        system_guard 조회 실패: {error}
      </div>
    );
  }

  if (!guard) {
    return (
      <div className="rounded-xl border p-4 text-slate-500">
        system_guard 로딩 중…
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">시스템 가드</div>
          <div className="text-lg font-semibold">
            {guard.trading_enabled ? "실거래 가능" : "실거래 차단"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {cooldown.active && (
            <div className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
              토큰 쿨다운 {cooldown.sec}초
            </div>
          )}

          <div
            className={`rounded-full px-3 py-1 text-sm font-medium ${guard.trading_enabled
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
              }`}
          >
            {guard.trading_enabled ? "ON" : "OFF"}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1 text-sm text-slate-600">
        <div>에러 누적: {guard.error_count}</div>
        <div>
          마지막 에러:{" "}
          {guard.last_error_at ? new Date(guard.last_error_at).toLocaleString() : "-"}
        </div>

        <div>토큰 쿨다운 횟수: {guard.token_cooldown_count ?? 0}</div>
        <div>
          마지막 토큰 쿨다운:{" "}
          {guard.last_token_cooldown_at
            ? new Date(guard.last_token_cooldown_at).toLocaleString()
            : "-"}
        </div>

        <div className="pt-2 text-slate-800 font-medium">최근 정상 수집</div>
        <div>
          시간:{" "}
          {guard.last_success_at
            ? new Date(guard.last_success_at).toLocaleString()
            : "-"}
        </div>
        <div>
          종목: {guard.last_success_symbol ?? "-"} / 가격:{" "}
          {guard.last_success_price != null ? guard.last_success_price.toLocaleString() : "-"}
        </div>
      </div>
    </div>
  );
}