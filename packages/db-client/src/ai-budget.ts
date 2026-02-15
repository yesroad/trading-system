import { getSupabase } from './client.js';

type Market = 'CRYPTO' | 'KRX' | 'US';

export interface AIBudgetRecord {
  id: string;
  date: string;
  market: Market;
  call_count: number;
  estimated_cost_usd: string;
  created_at: string;
  updated_at: string;
}

/**
 * AI 호출 기록 (일별)
 *
 * @param params - 호출 기록 파라미터
 */
export async function recordAICall(params: {
  date: string; // 'YYYY-MM-DD'
  market: Market;
  estimatedCostUsd?: number;
}): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.rpc('increment_ai_budget', {
    p_date: params.date,
    p_market: params.market,
    p_cost: params.estimatedCostUsd ?? 0,
  });

  if (error) {
    throw new Error(`AI 예산 기록 실패: ${error.message}`);
  }
}

/**
 * 일일 AI 호출 횟수 조회
 *
 * @param params - 조회 파라미터
 * @returns 호출 횟수
 */
export async function getDailyCallCount(params: {
  date: string;
  market: Market;
}): Promise<number> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('ai_budget_tracking')
    .select('call_count')
    .eq('date', params.date)
    .eq('market', params.market)
    .maybeSingle();

  if (error) {
    throw new Error(`AI 호출 횟수 조회 실패: ${error.message}`);
  }

  return data?.call_count ?? 0;
}

/**
 * 시간별 AI 호출 횟수 조회 (최근 N시간)
 *
 * DB에는 일별로만 저장하므로, 메모리 기반으로 시간별 추적 필요
 * 이 함수는 오늘 날짜의 총 호출 횟수만 반환
 *
 * @param params - 조회 파라미터
 * @returns 오늘 누적 호출 횟수
 */
export async function getHourlyCallCount(params: { market: Market }): Promise<number> {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  return getDailyCallCount({ date: today, market: params.market });
}

/**
 * 월별 AI 비용 조회
 *
 * @param params - 조회 파라미터
 * @returns 월별 총 비용 (USD)
 */
export async function getMonthlyAICost(params: {
  year: number;
  month: number; // 1-12
  market?: Market;
}): Promise<number> {
  const supabase = getSupabase();

  const monthStr = `${params.year}-${String(params.month).padStart(2, '0')}`;

  let query = supabase
    .from('ai_budget_tracking')
    .select('estimated_cost_usd')
    .like('date', `${monthStr}%`);

  if (params.market) {
    query = query.eq('market', params.market);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`월별 비용 조회 실패: ${error.message}`);
  }

  if (!data || data.length === 0) return 0;

  return data.reduce((sum, row) => sum + parseFloat(row.estimated_cost_usd), 0);
}
