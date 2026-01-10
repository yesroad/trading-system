/**
 * system_guard 단일 row(id=1) 접근
 */

import { supabase } from "./supabase.js";

const ID = 1;

export type SystemGuardRow = {
  id: number;
  trading_enabled: boolean;
  error_count: number;
  last_error_at: string | null;
  updated_at: string;

  token_cooldown_count?: number;
  token_cooldown_until?: string | null;
  last_token_cooldown_at?: string | null;

  last_success_at?: string | null;
  last_success_symbol?: string | null;
  last_success_price?: number | null;
};

export async function getSystemGuard() {
  const { data, error } = await supabase
    .from("system_guard")
    .select(
      "id,trading_enabled,error_count,last_error_at,updated_at,token_cooldown_count,token_cooldown_until,last_token_cooldown_at,last_success_at,last_success_symbol,last_success_price"
    )
    .eq("id", ID)
    .single();

  if (error) throw new Error(error.message);
  return data as SystemGuardRow;
}

export async function bumpErrorCount(nextCount: number) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("system_guard")
    .update({
      error_count: nextCount,
      last_error_at: now,
      updated_at: now,
    })
    .eq("id", ID);

  if (error) throw new Error(error.message);
}

export async function setTradingEnabled(enabled: boolean) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("system_guard")
    .update({
      trading_enabled: enabled,
      updated_at: now,
    })
    .eq("id", ID);

  if (error) throw new Error(error.message);
}

/**
 * 토큰 발급 제한/실패로 쿨다운이 시작됐음을 기록
 * - 실패 시 60초 쿨다운을 기준으로 DB에 만료시각 저장
 */
export async function recordTokenCooldown(cooldownMs = 60_000) {
  const now = new Date();
  const until = new Date(now.getTime() + cooldownMs);

  const guard = await getSystemGuard();
  const nextCount = (guard.token_cooldown_count ?? 0) + 1;

  const { error } = await supabase
    .from("system_guard")
    .update({
      token_cooldown_count: nextCount,
      token_cooldown_until: until.toISOString(),
      last_token_cooldown_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", ID);

  if (error) throw new Error(error.message);
}

/**
 * 최근 정상 수집 시간/종목/가격 기록 (웹 표시용)
 */
export async function recordLastSuccess(params: {
  symbol: string;
  price: number;
}) {
  const now = new Date().toISOString();

  const { error } = await supabase
    .from("system_guard")
    .update({
      last_success_at: now,
      last_success_symbol: params.symbol,
      last_success_price: params.price,
      updated_at: now,
    })
    .eq("id", ID);

  if (error) throw new Error(error.message);
}
