/**
 * KIS (모의/실전) - 토큰 발급 + 국내주식 현재가/랭킹 조회
 */

import { TokenManager, TokenCooldownError, KisTokenError } from '@workspace/kis-auth';
import type { Nullable } from './types/utils';
import {
  KIS_BASE_URL,
  KIS_APP_KEY,
  KIS_APP_SECRET,
  KIS_ACCOUNT_NO,
  KIS_ACCOUNT_PRODUCT_CD,
  KIS_TR_PREFIX,
} from './kisConfig';

// 토큰 매니저 인스턴스 생성 (모듈 스코프)
const tokenManager = new TokenManager('kis-collector');

// 에러 클래스 re-export
export { TokenCooldownError, KisTokenError };

type KisPriceResponse = {
  output?: {
    stck_prpr?: string; // 현재가 (string number)
  };
};

// 예수금 캐시 (60초)
let cachedBalance: Nullable<{ value: number; fetchedAt: number }> = null;
const BALANCE_CACHE_MS = 60_000;

/**
 * 국내주식 현재가 조회
 * @param code 종목코드 (예: "005930")
 */
export async function fetchKrxPrice(code: string) {
  const token = await tokenManager.getToken();

  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', code);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
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

type KisBalanceResponse = {
  output2?: Array<{
    dnca_tot_amt?: string; // 예수금
  }>;
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
};

/**
 * 예수금 조회 (KIS API)
 *
 * 엔드포인트: /uapi/domestic-stock/v1/trading/inquire-balance
 * - 응답: output2[0].dnca_tot_amt (예수금)
 * - 60초 캐싱
 * - 실패 시: 캐시 있으면 캐시 사용, 없으면 null
 */
export async function fetchAccountBalance(): Promise<Nullable<number>> {
  const now = Date.now();

  // 캐시 유효성 확인 (60초 이내)
  if (cachedBalance && now - cachedBalance.fetchedAt < BALANCE_CACHE_MS) {
    console.log(
      '[kis-collector] 예수금 조회 (캐시):',
      Math.floor(cachedBalance.value).toLocaleString(),
      'KRW',
    );
    return cachedBalance.value;
  }

  try {
    const token = await tokenManager.getToken();

    // 환경별 tr_id (실전: TTTC8434R, 모의: VTTC8434R)
    const trId = `${KIS_TR_PREFIX}TTC8434R`;

    console.log(`[kis-collector] 예수금 조회 시작 | tr_id: ${trId}`);

    const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/trading/inquire-balance`);
    url.searchParams.set('CANO', KIS_ACCOUNT_NO);
    url.searchParams.set('ACNT_PRDT_CD', KIS_ACCOUNT_PRODUCT_CD);
    url.searchParams.set('AFHR_FLPR_YN', 'N');
    url.searchParams.set('OFL_YN', '');
    url.searchParams.set('INQR_DVSN', '02');
    url.searchParams.set('UNPR_DVSN', '01');
    url.searchParams.set('FUND_STTL_ICLD_YN', 'N');
    url.searchParams.set('FNCG_AMT_AUTO_RDPT_YN', 'N');
    url.searchParams.set('PRCS_DVSN', '01');
    url.searchParams.set('CTX_AREA_FK100', '');
    url.searchParams.set('CTX_AREA_NK100', '');

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: KIS_APP_KEY,
        appsecret: KIS_APP_SECRET,
        tr_id: trId,
        custtype: 'P',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[kis-collector] 예수금 조회 실패: ${res.status} | tr_id: ${trId}`, text);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    const json = (await res.json()) as KisBalanceResponse;

    // rt_cd="1"이면 에러
    if (json.rt_cd === '1') {
      const errMsg = json.msg1 || json.msg_cd || 'unknown error';
      console.error(
        `[kis-collector] 예수금 조회 오류: ${json.msg_cd} - ${errMsg} | tr_id: ${trId}`,
      );
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    const balanceStr = json.output2?.[0]?.dnca_tot_amt;
    if (!balanceStr) {
      console.error('[kis-collector] 예수금 응답 형식 오류:', json);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    const balance = Number(balanceStr.replaceAll(',', '').trim());
    if (!Number.isFinite(balance)) {
      console.error('[kis-collector] 예수금 파싱 실패:', balanceStr);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    // 캐시 갱신
    cachedBalance = { value: balance, fetchedAt: now };

    console.log(
      '[kis-collector] ✅ 예수금 조회 성공:',
      Math.floor(balance).toLocaleString(),
      'KRW',
    );
    return balance;
  } catch (e) {
    console.error('[kis-collector] 예수금 조회 예외:', e);
    // 실패 시 캐시 사용
    return cachedBalance?.value ?? null;
  }
}
