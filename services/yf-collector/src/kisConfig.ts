/**
 * KIS API 공통 설정
 */

import { requireEnv as env } from '@workspace/shared-utils';

// KIS 환경 설정
export const KIS_ENV = (process.env.KIS_ENV || 'REAL').toUpperCase();

// KIS API 엔드포인트 (환경변수에서 가져오기)
export const KIS_BASE_URL =
  KIS_ENV === 'PAPER' || KIS_ENV === 'MOCK' || KIS_ENV === 'SIM'
    ? env('KIS_PAPER_BASE_URL') // 모의투자
    : env('KIS_REAL_BASE_URL'); // 실전투자

// KIS API 인증 정보
export const KIS_APP_KEY = env('KIS_APP_KEY');
export const KIS_APP_SECRET = env('KIS_APP_SECRET');

// KIS 계좌 정보 (환경에 따라 실투자/모의투자 계좌 구분)
export const KIS_ACCOUNT_NO =
  KIS_ENV === 'PAPER' || KIS_ENV === 'MOCK' || KIS_ENV === 'SIM'
    ? env('KIS_PAPER_ACCOUNT_NO') // 모의투자 계좌
    : env('KIS_REAL_ACCOUNT_NO'); // 실투자 계좌

export const KIS_ACCOUNT_PRODUCT_CD = env('KIS_ACCOUNT_PRODUCT_CD');

// 환경별 TR_ID prefix (실전: T, 모의: V)
export const KIS_TR_PREFIX =
  KIS_ENV === 'PAPER' || KIS_ENV === 'MOCK' || KIS_ENV === 'SIM' ? 'V' : 'T';

console.log(
  `[yf-collector] KIS API 환경: ${KIS_ENV} | BASE_URL: ${KIS_BASE_URL} | TR_PREFIX: ${KIS_TR_PREFIX}`,
);
