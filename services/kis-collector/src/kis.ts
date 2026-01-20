/**
 * KIS (모의) - 토큰 발급 + 국내주식 현재가 조회
 */

import { env } from './utils/env.js';
import type { Nullable } from './types/utils.js';

type KisTokenResponse = {
  access_token: string;
  expires_in: number; // seconds
};

type KisPriceResponse = {
  output?: {
    stck_prpr?: string; // 현재가 (string number)
  };
};

export class TokenCooldownError extends Error {
  untilMs: number;

  constructor(untilMs: number) {
    const waitSec = Math.ceil((untilMs - Date.now()) / 1000);
    super(`[kis-collector] 토큰 쿨다운 중 (${waitSec}s)`);
    this.name = 'TokenCooldownError';
    this.untilMs = untilMs;
  }

  get remainingMs() {
    return Math.max(0, this.untilMs - Date.now());
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

let cachedToken: Nullable<{ value: string; expiresAt: number }> = null;

// 토큰 발급 실패 시 쿨다운(기본 60초)
let nextTokenRequestAt = 0;

const BASE_URL = env('KIS_BASE_URL');
const APP_KEY = env('KIS_APP_KEY');
const APP_SECRET = env('KIS_APP_SECRET');

async function getAccessToken() {
  const now = Date.now();

  // 캐시된 토큰 사용
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  // 쿨다운 중이면 토큰 발급 시도 자체를 하지 않음
  if (now < nextTokenRequestAt) {
    throw new TokenCooldownError(nextTokenRequestAt);
  }

  console.log('[kis-collector] KIS 토큰 발급 요청');

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[kis-collector] 토큰 발급 실패', text);

    // KIS 제한 대응: 실패 시 최소 60초 쿨다운
    nextTokenRequestAt = Date.now() + 60_000;

    throw new KisTokenError(res.status, text);
  }

  const data = (await res.json()) as KisTokenResponse;

  cachedToken = {
    value: data.access_token,
    // 만료 30초 전에 갱신
    expiresAt: Date.now() + (data.expires_in - 30) * 1000,
  };

  // 성공하면 쿨다운 해제
  nextTokenRequestAt = 0;

  console.log('[kis-collector] KIS 토큰 발급 성공');

  return cachedToken.value;
}

/**
 * 국내주식 현재가 조회
 * @param code 종목코드 (예: "005930")
 */
export async function fetchKrxPrice(code: string) {
  const token = await getAccessToken();

  const url = new URL(`${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', code);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY,
      appsecret: APP_SECRET,
      tr_id: 'FHKST01010100',
      custtype: 'P',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[kis-collector] 현재가 조회 실패 ${code}`, text);
    throw new Error(`KIS price failed: ${res.status}`);
  }

  const json = (await res.json()) as KisPriceResponse;

  const priceStr = json.output?.stck_prpr;
  if (!priceStr) {
    console.error(`[kis-collector] 현재가 응답 형식 오류 ${code}`, json);
    throw new Error('invalid KIS price response');
  }

  return { price: Number(priceStr), raw: json };
}
