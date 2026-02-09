/**
 * KIS (모의/실전) - 토큰 발급 + 해외주식 예수금 조회
 */

import { TokenManager, TokenCooldownError, KisTokenError } from '@workspace/kis-auth';
import type { Nullable } from '@workspace/shared-utils';
import Big from 'big.js';
import { DateTime } from 'luxon';
import {
  KIS_BASE_URL,
  KIS_APP_KEY,
  KIS_APP_SECRET,
  KIS_ACCOUNT_NO,
  KIS_ACCOUNT_PRODUCT_CD,
  KIS_TR_PREFIX,
} from './kisConfig.js';

// 토큰 매니저 인스턴스 생성 (모듈 스코프)
const tokenManager = new TokenManager('yf-collector');

// 에러 클래스 re-export
export { TokenCooldownError, KisTokenError };

type KisOverseasBalanceResponse = {
  output1?: Array<{
    pdno?: string; // 상품번호
    prdt_name?: string; // 상품명
    cblc_qty13?: string; // 잔고수량13
    ord_psbl_qty1?: string; // 주문가능수량1
  }>;
  output2?:
    | Array<{
        crcy_cd?: string; // 통화코드
        crcy_cd_name?: string; // 통화코드명
        frcr_dncl_amt_2?: string; // 외화예수금액2
        frst_bltn_exrt?: string; // 최초고시환율
        frcr_evlu_amt2?: string; // 외화평가금액2
      }>
    | {
        crcy_cd?: string; // 통화코드
        crcy_cd_name?: string; // 통화코드명
        frcr_dncl_amt_2?: string; // 외화예수금액2
        frst_bltn_exrt?: string; // 최초고시환율
        frcr_evlu_amt2?: string; // 외화평가금액2
      };
  output3?: {
    pchs_amt_smtl_amt?: string; // 매입금액합계금액
    tot_evlu_pfls_amt?: string; // 총평가손익금액
    evlu_erng_rt1?: string; // 평가수익율1
    tot_dncl_amt?: string; // 총예수금액
    wcrc_evlu_amt_smtl?: string; // 원화평가금액합계
    tot_asst_amt2?: string; // 총자산금액2
  };
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
};

// 예수금 캐시 (60초)
let cachedBalance: Nullable<{ value: number; fetchedAt: number }> = null;
const BALANCE_CACHE_MS = 60_000;
const KIS_NO_DATA_MSG_CD = '70070000';

/**
 * 해외주식 매수가능금액 조회 (KIS API)
 *
 * 엔드포인트: /uapi/overseas-stock/v1/trading/inquire-balance
 * - 응답: output2[0].frcr_dncl_amt_2 (외화예수금액 USD)
 * - 60초 캐싱
 * - 실패 시: 캐시 있으면 캐시 사용, 없으면 null
 */
export async function fetchOverseasAccountBalance(): Promise<number | null> {
  const now = DateTime.now().toMillis();

  // 캐시 유효성 확인 (60초 이내)
  if (cachedBalance && now - cachedBalance.fetchedAt < BALANCE_CACHE_MS) {
    return cachedBalance.value;
  }

  try {
    const token = await tokenManager.getToken();

    // 환경별 tr_id (실전: TTTS3012R, 모의: VTTS3012R)
    const trId = `${KIS_TR_PREFIX}TTS3012R`;

    console.log(`[yf-collector] 해외주식 매수가능금액 조회 시작 | tr_id: ${trId}`);

    const url = new URL(`${KIS_BASE_URL}/uapi/overseas-stock/v1/trading/inquire-balance`);
    url.searchParams.set('CANO', KIS_ACCOUNT_NO);
    url.searchParams.set('ACNT_PRDT_CD', KIS_ACCOUNT_PRODUCT_CD);
    url.searchParams.set('OVRS_EXCG_CD', 'NASD'); // 해외거래소코드
    url.searchParams.set('TR_CRCY_CD', 'USD'); // 거래통화코드
    url.searchParams.set('CTX_AREA_FK200', ''); // 연속조회검색조건
    url.searchParams.set('CTX_AREA_NK200', ''); // 연속조회키

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
      console.error(`[yf-collector] 매수가능금액 조회 실패: ${res.status} | tr_id: ${trId}`, text);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    const json = (await res.json()) as KisOverseasBalanceResponse;

    // rt_cd="1"이면 에러
    if (json.rt_cd === '1') {
      const errMsg = json.msg1 || json.msg_cd || 'unknown error';
      console.error(
        `[yf-collector] 매수가능금액 조회 오류: ${json.msg_cd} - ${errMsg} | tr_id: ${trId}`,
      );
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    const output2 = json.output2;
    const balanceStr = Array.isArray(output2)
      ? output2[0]?.frcr_dncl_amt_2
      : output2?.frcr_dncl_amt_2;

    // 모의투자/신규계좌에서 조회 내역 없음 응답은 정상 케이스로 본다.
    if (!balanceStr && json.msg_cd === KIS_NO_DATA_MSG_CD) {
      cachedBalance = { value: 0, fetchedAt: now };
      console.log('[yf-collector] 예수금 조회 내역 없음 - USD 0으로 처리');
      return 0;
    }

    if (!balanceStr) {
      console.error('[yf-collector] 매수가능금액 응답 형식 오류:', json);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    let balance: number;
    try {
      const bigBalance = new Big(balanceStr.replaceAll(',', '').trim());
      balance = Number(bigBalance.toString());
    } catch {
      console.error('[yf-collector] 매수가능금액 파싱 실패:', balanceStr);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }
    if (!Number.isFinite(balance)) {
      console.error('[yf-collector] 매수가능금액 파싱 실패:', balanceStr);
      // 실패 시 캐시 사용
      return cachedBalance?.value ?? null;
    }

    // 캐시 갱신
    cachedBalance = { value: balance, fetchedAt: now };

    console.log('[yf-collector] 해외주식 매수가능금액 조회 성공 (USD):', Math.floor(balance));
    return balance;
  } catch (e) {
    console.error('[yf-collector] 매수가능금액 조회 예외:', e);
    // 실패 시 캐시 사용
    return cachedBalance?.value ?? null;
  }
}
