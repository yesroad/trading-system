import { getSupabase } from './client.js';
import { nowIso } from '@workspace/shared-utils';

type BigInput = number | string;

export type UpsertAccountCashParams = {
  broker: string;
  market: string;
  currency: string;
  cash_available: BigInput;
  as_of?: string;
};

/**
 * account_cash 최신 잔고를 저장한다.
 * - 기본: (broker, market, currency) 키로 upsert
 * - unique 제약이 없는 스키마에서는 insert로 fallback
 */
export async function upsertAccountCash(params: UpsertAccountCashParams): Promise<void> {
  const supabase = getSupabase();
  const asOf = params.as_of ?? nowIso();

  const payload = {
    broker: params.broker,
    market: params.market,
    currency: params.currency,
    cash_available: String(params.cash_available),
    as_of: asOf,
  };

  const upsertRes = await supabase
    .from('account_cash')
    .upsert(payload, { onConflict: 'broker,market,currency' });

  if (!upsertRes.error) return;

  // unique 제약조건이 없으면 upsert가 실패할 수 있다.
  if ((upsertRes.error as { code?: string }).code === '42P10') {
    const insertRes = await supabase.from('account_cash').insert(payload);
    if (!insertRes.error) return;
    throw new Error(`account_cash insert 실패: ${insertRes.error.message}`);
  }

  throw new Error(`account_cash upsert 실패: ${upsertRes.error.message}`);
}

