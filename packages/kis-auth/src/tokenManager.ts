/**
 * KIS 토큰 매니저 - DB 기반 토큰 발급 및 관리
 */

import { supabase } from './db/supabase.js';
import { TokenCooldownError, KisTokenError } from './errors.js';
import type { KisTokenResponse, SystemGuardKisToken } from './types/types.js';
import { DateTime } from 'luxon';
import { env, requireEnv } from '@workspace/shared-utils';

// KIS API 설정
const KIS_ENV = (env('KIS_ENV') ?? 'REAL').toUpperCase();
const KIS_BASE_URL =
  KIS_ENV === 'PAPER' || KIS_ENV === 'MOCK' || KIS_ENV === 'SIM'
    ? requireEnv('KIS_PAPER_BASE_URL')
    : requireEnv('KIS_REAL_BASE_URL');
const KIS_APP_KEY = requireEnv('KIS_APP_KEY');
const KIS_APP_SECRET = requireEnv('KIS_APP_SECRET');

console.log(`[kis-auth] KIS API 환경: ${KIS_ENV} | BASE_URL: ${KIS_BASE_URL}`);

function parseIsoToMillis(iso: string): number {
  const parsed = DateTime.fromISO(iso);
  return parsed.isValid ? parsed.toMillis() : 0;
}

function mustIso(dt: DateTime): string {
  const iso = dt.toUTC().toISO();
  if (!iso) throw new Error('ISO 변환 실패');
  return iso;
}

export class TokenManager {
  private readonly SYSTEM_GUARD_ID = 1;
  private readonly TOKEN_EXPIRY_BUFFER_SEC = 30; // 만료 30초 전에 갱신
  private readonly COOLDOWN_MS = 60_000; // 60초 쿨다운
  private readonly serviceName: string;

  constructor(serviceName: string = 'kis-auth') {
    this.serviceName = serviceName;
  }

  /**
   * 토큰 조회 - DB에서 유효한 토큰 반환 또는 재발급
   */
  async getToken(): Promise<string> {
    const now = DateTime.now().toMillis();

    // 1. system_guard에서 현재 토큰 상태 조회
    const { data, error } = await supabase
      .from('system_guard')
      .select(
        'kis_token_value,kis_token_expires_at,kis_token_last_issued_at,kis_token_issue_count,kis_token_last_error_at,kis_token_last_error_message,token_cooldown_until',
      )
      .eq('id', this.SYSTEM_GUARD_ID)
      .single();

    if (error) {
      console.error('[kis-auth] system_guard 조회 실패:', error.message);
      throw new Error(`Failed to fetch system_guard: ${error.message}`);
    }

    const tokenData = data as SystemGuardKisToken;

    // 2. 쿨다운 체크
    const cooldownUntil = tokenData.token_cooldown_until
      ? parseIsoToMillis(tokenData.token_cooldown_until)
      : 0;
    if (now < cooldownUntil) {
      console.log(`[kis-auth] 토큰 쿨다운 중 (${Math.ceil((cooldownUntil - now) / 1000)}초 남음)`);
      throw new TokenCooldownError(cooldownUntil);
    }

    // 3. 토큰 유효성 확인
    const expiresAt = tokenData.kis_token_expires_at
      ? parseIsoToMillis(tokenData.kis_token_expires_at)
      : 0;

    if (tokenData.kis_token_value && expiresAt > now) {
      // 유효한 토큰 반환
      const remainingSec = Math.floor((expiresAt - now) / 1000);
      const expiresAtKst = DateTime.fromMillis(expiresAt)
        .setZone('Asia/Seoul')
        .toFormat('yyyy-LL-dd HH:mm:ss');
      console.log(
        `[${this.serviceName}] 캐시된 토큰 사용 (만료까지 ${remainingSec}초, 만료 시각: ${expiresAtKst})`,
      );
      return tokenData.kis_token_value;
    }

    // 4. 토큰 만료 또는 없음 → 재발급
    console.log('[kis-auth] 토큰 만료 또는 없음 → 재발급 시작');
    return await this.issueToken(tokenData.kis_token_issue_count);
  }

  /**
   * KIS API 호출하여 새 토큰 발급
   */
  private async issueToken(currentIssueCount: number): Promise<string> {
    console.log('[kis-auth] KIS 토큰 발급 요청');

    try {
      const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          appkey: KIS_APP_KEY,
          appsecret: KIS_APP_SECRET,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error('[kis-auth] 토큰 발급 실패', res.status, text);

        // 실패 기록 및 쿨다운 설정
        await this.recordTokenError(res.status, text);

        throw new KisTokenError(res.status, text);
      }

      const tokenRes = (await res.json()) as KisTokenResponse;

      // 토큰 DB 저장
      await this.updateTokenInDB(tokenRes.access_token, tokenRes.expires_in, currentIssueCount);

      console.log('[kis-auth] ✅ KIS 토큰 발급 성공');
      return tokenRes.access_token;
    } catch (err) {
      if (err instanceof KisTokenError) {
        throw err;
      }

      console.error('[kis-auth] 토큰 발급 예외:', err);
      throw err;
    }
  }

  /**
   * system_guard 테이블에 토큰 저장
   */
  private async updateTokenInDB(
    token: string,
    expiresInSec: number,
    currentIssueCount: number,
  ): Promise<void> {
    const now = DateTime.now();
    const expiresAt = now.plus({ seconds: expiresInSec - this.TOKEN_EXPIRY_BUFFER_SEC });
    const nowIso = mustIso(now);
    const expiresAtIso = mustIso(expiresAt);

    const { error } = await supabase
      .from('system_guard')
      .update({
        kis_token_value: token,
        kis_token_expires_at: expiresAtIso,
        kis_token_last_issued_at: nowIso,
        kis_token_issue_count: currentIssueCount + 1,
        kis_token_last_error_at: null,
        kis_token_last_error_message: null,
        token_cooldown_until: null, // 성공 시 쿨다운 해제
        updated_at: nowIso,
      })
      .eq('id', this.SYSTEM_GUARD_ID);

    if (error) {
      console.error('[kis-auth] 토큰 DB 저장 실패:', error.message);
      throw new Error(`Failed to update token in DB: ${error.message}`);
    }

    console.log(
      `[kis-auth] 토큰 DB 저장 완료 (만료: ${expiresAtIso}, issue_count: ${currentIssueCount + 1})`,
    );
  }

  /**
   * 토큰 발급 실패 기록 및 쿨다운 설정
   */
  private async recordTokenError(status: number, errorText: string): Promise<void> {
    const now = DateTime.now();
    const cooldownUntil = now.plus({ milliseconds: this.COOLDOWN_MS });
    const nowIso = mustIso(now);
    const cooldownUntilIso = mustIso(cooldownUntil);

    const { error } = await supabase
      .from('system_guard')
      .update({
        kis_token_last_error_at: nowIso,
        kis_token_last_error_message: `${status}: ${errorText.substring(0, 200)}`,
        token_cooldown_until: cooldownUntilIso,
        updated_at: nowIso,
      })
      .eq('id', this.SYSTEM_GUARD_ID);

    if (error) {
      console.error('[kis-auth] 토큰 에러 기록 실패:', error.message);
    } else {
      console.log(`[kis-auth] 토큰 발급 실패 기록 완료 (쿨다운: ${this.COOLDOWN_MS / 1000}초)`);
    }
  }
}
