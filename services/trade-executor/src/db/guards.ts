import { getSupabase } from '@workspace/db-client';
import { DateTime } from 'luxon';
import { TRADING_CONFIG } from '../config/trading';

type GuardRow = Record<string, unknown>;

export type SystemGuardCheckResult = {
  allowed: boolean;
  reason: string;
  tradingEnabled: boolean;
  cooldownUntil: string | null;
  errorCount: number;
};

export type DailyTradeLimitCheckResult = {
  allowed: boolean;
  reason: string;
  date: string;
  currentTrades: number;
  maxDailyTrades: number;
  remainingTrades: number;
};

export type AutoRecoveryResult = {
  recovered: boolean;
  reason: string;
};

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNonNegativeInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.floor(parsed);
    }
  }
  return 0;
}

function mustIso(dt: DateTime): string {
  const iso = dt.toISO();
  if (!iso) throw new Error('ISO 변환 실패');
  return iso;
}

function hasColumn(row: GuardRow, column: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, column);
}

function resolveTradingEnabled(row: GuardRow): boolean {
  return asBoolean(row.trading_enabled ?? row.is_trading_enabled);
}

function resolveCooldownUntil(row: GuardRow): string | null {
  return asNullableString(row.cooldown_until ?? row.token_cooldown_until);
}

function buildGuardUpdate(row: GuardRow, patch: {
  tradingEnabled?: boolean;
  reason?: string | null;
  cooldownUntil?: string | null;
  errorCount?: number;
  setLastErrorAt?: boolean;
  setLastSuccessAt?: boolean;
}): Record<string, unknown> {
  const now = mustIso(DateTime.now());
  const out: Record<string, unknown> = {};

  if (patch.tradingEnabled !== undefined) {
    if (hasColumn(row, 'trading_enabled')) out.trading_enabled = patch.tradingEnabled;
    if (hasColumn(row, 'is_trading_enabled')) out.is_trading_enabled = patch.tradingEnabled;
  }

  if (patch.reason !== undefined && hasColumn(row, 'reason')) {
    out.reason = patch.reason;
  }

  if (patch.cooldownUntil !== undefined) {
    if (hasColumn(row, 'cooldown_until')) out.cooldown_until = patch.cooldownUntil;
    if (hasColumn(row, 'token_cooldown_until')) out.token_cooldown_until = patch.cooldownUntil;
  }

  if (patch.errorCount !== undefined && hasColumn(row, 'error_count')) {
    out.error_count = patch.errorCount;
  }

  if (patch.setLastErrorAt && hasColumn(row, 'last_error_at')) {
    out.last_error_at = now;
  }

  if (patch.setLastSuccessAt && hasColumn(row, 'last_success_at')) {
    out.last_success_at = now;
  }

  if (hasColumn(row, 'updated_at')) {
    out.updated_at = now;
  }

  return out;
}

async function getSystemGuardRow(): Promise<GuardRow> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('system_guard').select('*').eq('id', 1).single();

  if (error) {
    throw new Error(`system_guard 조회 실패: ${error.message}`);
  }

  return (data ?? {}) as GuardRow;
}

async function updateSystemGuardRow(row: GuardRow, patch: Record<string, unknown>): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  const supabase = getSupabase();
  const { error } = await supabase.from('system_guard').update(patch).eq('id', 1);
  if (error) {
    throw new Error(`system_guard 업데이트 실패: ${error.message}`);
  }
}

/**
 * system_guard 상태를 조회해 현재 주문 가능 여부를 반환한다.
 * - trading_enabled / is_trading_enabled 둘 다 지원
 * - cooldown_until이 현재 시각보다 미래면 차단
 */
export async function checkSystemGuard(): Promise<SystemGuardCheckResult> {
  const row = await getSystemGuardRow();

  const tradingEnabled = resolveTradingEnabled(row);
  const cooldownUntil = resolveCooldownUntil(row);
  const reason = asNullableString(row.reason) ?? 'system_guard blocked';
  const errorCount = asNonNegativeInt(row.error_count);

  if (!tradingEnabled) {
    return {
      allowed: false,
      reason,
      tradingEnabled,
      cooldownUntil,
      errorCount,
    };
  }

  if (cooldownUntil) {
    const until = DateTime.fromISO(cooldownUntil);
    if (until.isValid && until.toMillis() > DateTime.now().toMillis()) {
      return {
        allowed: false,
        reason: `cooldown active until ${cooldownUntil}`,
        tradingEnabled,
        cooldownUntil,
        errorCount,
      };
    }
  }

  return {
    allowed: true,
    reason: 'ok',
    tradingEnabled,
    cooldownUntil,
    errorCount,
  };
}

/**
 * 일일 거래 횟수 제한 체크 (KST 기준 날짜)
 */
export async function checkDailyTradeLimit(): Promise<DailyTradeLimitCheckResult> {
  const supabase = getSupabase();
  const todayKst = DateTime.now().setZone('Asia/Seoul').toISODate();

  if (!todayKst) {
    throw new Error('KST 날짜 계산 실패');
  }

  const { data, error } = await supabase
    .from('daily_trading_stats')
    .select('total_trades')
    .eq('date', todayKst)
    .maybeSingle();

  if (error) {
    throw new Error(`daily_trading_stats 조회 실패: ${error.message}`);
  }

  const currentTrades = asNonNegativeInt((data as { total_trades?: unknown } | null)?.total_trades);
  const maxDailyTrades = TRADING_CONFIG.maxDailyTrades;
  const remainingTrades = Math.max(0, maxDailyTrades - currentTrades);
  const allowed = currentTrades < maxDailyTrades;

  return {
    allowed,
    reason: allowed ? 'ok' : 'daily trade limit exceeded',
    date: todayKst,
    currentTrades,
    maxDailyTrades,
    remainingTrades,
  };
}

/**
 * 주문 실패 누적을 system_guard에 기록하고 임계치 도달 시 거래를 중단한다.
 */
export async function markSystemGuardFailure(params: {
  message: string;
  threshold?: number;
  cooldownMinutes?: number;
}): Promise<void> {
  const row = await getSystemGuardRow();

  const threshold = params.threshold ?? TRADING_CONFIG.autoDisableConsecutiveFailures;
  const cooldownMinutes = params.cooldownMinutes ?? TRADING_CONFIG.autoRecoveryCooldownMin;

  const nextErrorCount = asNonNegativeInt(row.error_count) + 1;

  let tradingEnabled = resolveTradingEnabled(row);
  let reason = `trade-executor failure: ${params.message}`;
  let cooldownUntil: string | null = null;

  if (nextErrorCount >= threshold) {
    tradingEnabled = false;
    cooldownUntil = mustIso(DateTime.now().plus({ minutes: cooldownMinutes }));
    reason = `auto-disabled after ${nextErrorCount} failures: ${params.message}`;
  }

  const patch = buildGuardUpdate(row, {
    tradingEnabled,
    reason,
    cooldownUntil,
    errorCount: nextErrorCount,
    setLastErrorAt: true,
  });

  await updateSystemGuardRow(row, patch);
}

/**
 * 주문 성공 시 system_guard 오류 카운트를 리셋한다.
 */
export async function markSystemGuardSuccess(): Promise<void> {
  const row = await getSystemGuardRow();

  const patch = buildGuardUpdate(row, {
    errorCount: 0,
    setLastSuccessAt: true,
  });

  await updateSystemGuardRow(row, patch);
}

/**
 * 거래 중단 상태를 자동 복구한다.
 * - reason에 'manual'이 포함되면 수동 중단으로 간주하고 복구하지 않음
 * - cooldown_until이 없거나 현재 시각을 지난 경우 복구
 */
export async function tryAutoRecoverSystemGuard(): Promise<AutoRecoveryResult> {
  const row = await getSystemGuardRow();
  const enabled = resolveTradingEnabled(row);
  if (enabled) {
    return { recovered: false, reason: 'already enabled' };
  }

  const reason = (asNullableString(row.reason) ?? '').toLowerCase();
  if (reason.includes('manual')) {
    return { recovered: false, reason: 'manual lock' };
  }

  const cooldownUntil = resolveCooldownUntil(row);
  if (cooldownUntil) {
    const until = DateTime.fromISO(cooldownUntil);
    if (until.isValid && until.toMillis() > DateTime.now().toMillis()) {
      return { recovered: false, reason: `cooldown active until ${cooldownUntil}` };
    }
  }

  const patch = buildGuardUpdate(row, {
    tradingEnabled: true,
    reason: 'auto-recovered by trade-executor',
    cooldownUntil: null,
    errorCount: 0,
    setLastSuccessAt: true,
  });

  await updateSystemGuardRow(row, patch);
  return { recovered: true, reason: 'recovered' };
}
