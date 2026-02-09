/**
 * 자동 후보 코인 산출 (Upbit)
 *
 * ✅ 유동성(거래대금) 기준으로만 선정
 * ✅ 보유 코인 제외한 나머지 중 상위 선정
 */

import type { UpbitTicker } from './types/upbit.js';
import Big from 'big.js';

export type AutoCandidate = {
  market: string; // 'KRW-BTC'
  symbol: string; // 'BTC'
  trade_price: number;
  acc_trade_price_24h: number; // 거래대금
};

/**
 * 자동 후보 로드
 * @param allTickers 전체 KRW 마켓 티커
 * @param excludeSymbols 제외할 심볼 목록 (보유 코인 + DB 등록 코인)
 * @param limit 최종 반환 개수
 * @param krwBalance KRW 잔액 (매수 가능 여부 체크용)
 */
export function selectAutoCandidates(params: {
  allTickers: UpbitTicker[];
  excludeSymbols: Set<string>;
  limit: number;
  krwBalance: number;
}): AutoCandidate[] {
  const { allTickers, excludeSymbols, limit, krwBalance } = params;

  // KRW 마켓만 필터링 & 거래대금/가격 유효한 것만
  const candidates: AutoCandidate[] = [];

  for (const t of allTickers) {
    if (!t.market.startsWith('KRW-')) continue;
    if (!Number.isFinite(t.acc_trade_price_24h) || t.acc_trade_price_24h <= 0) continue;
    if (!Number.isFinite(t.trade_price) || t.trade_price === null) continue;

    const symbol = t.market.replace('KRW-', ''); // 'KRW-BTC' -> 'BTC'
    if (excludeSymbols.has(symbol)) continue; // 이미 선정된 코인 제외

    // ✅ 매수 가능 여부 체크: 현재가 기준 1개라도 매수 가능한지
    if (new Big(t.trade_price).gt(krwBalance)) continue;

    candidates.push({
      market: t.market,
      symbol,
      trade_price: t.trade_price,
      acc_trade_price_24h: t.acc_trade_price_24h,
    });
  }

  // 거래대금 내림차순 정렬
  candidates.sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h);

  return candidates.slice(0, limit);
}
