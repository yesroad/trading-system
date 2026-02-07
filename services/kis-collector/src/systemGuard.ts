/**
 * system_guard 단일 row(id=1) 접근
 */

import { supabase } from './db/supabase';
import { DateTime } from 'luxon';
import { nowIso, type Nullable } from '@workspace/shared-utils';

const ID = 1;

export type SystemGuardRow = {
  id: number;
  trading_enabled: boolean;
  error_count: number;
  last_error_at: Nullable<string>;
  updated_at: string;

  token_cooldown_count?: number;
  token_cooldown_until?: Nullable<string>;
  last_token_cooldown_at?: Nullable<string>;

  last_success_at?: Nullable<string>;
  last_success_symbol?: Nullable<string>;
  last_success_price?: Nullable<number>;

  // KIS 토큰 필드
  kis_token_value?: Nullable<string>;
  kis_token_expires_at?: Nullable<string>;
  kis_token_last_issued_at?: Nullable<string>;
  kis_token_issue_count?: number;
  kis_token_last_error_at?: Nullable<string>;
  kis_token_last_error_message?: Nullable<string>;
};

export async function getSystemGuard() {
  const { data, error } = await supabase
    .from('system_guard')
    .select(
      'id,trading_enabled,error_count,last_error_at,updated_at,token_cooldown_count,token_cooldown_until,last_token_cooldown_at,last_success_at,last_success_symbol,last_success_price,kis_token_value,kis_token_expires_at,kis_token_last_issued_at,kis_token_issue_count,kis_token_last_error_at,kis_token_last_error_message',
    )
    .eq('id', ID)
    .single();

  if (error) throw new Error(error.message);
  return data as SystemGuardRow;
}

export async function bumpErrorCount(nextCount: number) {
  const now = nowIso();

  const { error } = await supabase
    .from('system_guard')
    .update({
      error_count: nextCount,
      last_error_at: now,
      updated_at: now,
    })
    .eq('id', ID);

  if (error) throw new Error(error.message);
}

export async function setTradingEnabled(enabled: boolean) {
  const now = nowIso();

  const { error } = await supabase
    .from('system_guard')
    .update({
      trading_enabled: enabled,
      updated_at: now,
    })
    .eq('id', ID);

  if (error) throw new Error(error.message);
}

/**
 * 토큰 발급 제한/실패로 쿨다운이 시작됐음을 기록
 * - 실패 시 60초 쿨다운을 기준으로 DB에 만료시각 저장
 */
export async function recordTokenCooldown(cooldownMs = 60_000) {
  const now = DateTime.now();
  const until = now.plus({ milliseconds: cooldownMs });
  const nowIsoValue = now.toISO();
  const untilIsoValue = until.toISO();
  if (!nowIsoValue || !untilIsoValue) throw new Error('시간 ISO 변환 실패');

  const guard = await getSystemGuard();
  const nextCount = (guard.token_cooldown_count ?? 0) + 1;

  const { error } = await supabase
    .from('system_guard')
    .update({
      token_cooldown_count: nextCount,
      token_cooldown_until: untilIsoValue,
      last_token_cooldown_at: nowIsoValue,
      updated_at: nowIsoValue,
    })
    .eq('id', ID);

  if (error) throw new Error(error.message);
}

/**
 * 최근 정상 수집 시간/종목/가격 기록 (웹 표시용)
 */
export async function recordLastSuccess(params: { symbol: string; price: number }) {
  const now = nowIso();

  const { error } = await supabase
    .from('system_guard')
    .update({
      last_success_at: now,
      last_success_symbol: params.symbol,
      last_success_price: params.price,
      updated_at: now,
    })
    .eq('id', ID);

  if (error) throw new Error(error.message);
}
