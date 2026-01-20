import { supabase } from './supabase.js';

/**
 * 가격 tick 1건을 DB에 저장한다.
 *
 * - 실패 시 에러를 throw
 * - 호출부에서 재시도/로깅 판단
 */
export async function insertTick(tick: PriceTick) {
  const { error } = await supabase.from('kis_price_ticks').insert(tick);
  if (error) throw new Error(error.message);
}

/**
 * 가격 tick 데이터 타입
 */
export type PriceTick = {
  symbol: string;
  ts: string;
  price: number;
  raw: Record<string, unknown>;
};
