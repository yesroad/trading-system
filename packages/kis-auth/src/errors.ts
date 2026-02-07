import { DateTime } from 'luxon';

/**
 * KIS 토큰 관련 에러 클래스
 */

export class TokenCooldownError extends Error {
  untilMs: number;

  constructor(untilMs: number) {
    const waitSec = Math.ceil((untilMs - DateTime.now().toMillis()) / 1000);
    super(`[kis-auth] 토큰 쿨다운 중 (${waitSec}s)`);
    this.name = 'TokenCooldownError';
    this.untilMs = untilMs;
  }

  get remainingMs() {
    return Math.max(0, this.untilMs - DateTime.now().toMillis());
  }
}

export class KisTokenError extends Error {
  status: number;
  bodyText: string;

  constructor(status: number, bodyText: string) {
    super(`KIS token failed: ${status}`);
    this.name = 'KisTokenError';
    this.status = status;
    this.bodyText = bodyText;
  }
}
