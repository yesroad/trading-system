import { fetchOverseasAccountBalance } from './kis';
import { nowIso } from '@workspace/shared-utils';

export type AccountCashRow = {
  broker: string; // 'KIS'
  market: string; // 'US'
  currency: string; // 'USD'
  cash_available: number;
  as_of: string;
  created_at: string;
};

/**
 * 계좌 현금 잔고 조회 (KIS API)
 * - DB 조회 대신 KIS API를 직접 호출
 * - 실투자/모의투자는 환경변수(KIS_ENV)에 따라 자동 분기
 */
export async function loadAccountCash(params: {
  broker: string;
  market: string;
  currency: string;
}): Promise<AccountCashRow | null> {
  // KIS API로 해외주식 예수금 조회
  const balance = await fetchOverseasAccountBalance();

  if (balance === null) {
    console.error('[yf-collector] KIS API 예수금 조회 실패');
    return null;
  }

  const now = nowIso();

  // DB 조회 결과와 동일한 형식으로 반환
  return {
    broker: 'KIS',
    market: params.market,
    currency: params.currency,
    cash_available: balance,
    as_of: now,
    created_at: now,
  };
}
