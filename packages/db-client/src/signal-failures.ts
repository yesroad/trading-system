import { getSupabase } from './client.js';

type Market = 'CRYPTO' | 'KRX' | 'US';

export type SignalFailureType =
  | 'insufficient_technical_data'
  | 'validation_failed'
  | 'atr_missing'
  | 'error';

export interface SignalGenerationFailure {
  id: string;
  ai_analysis_id: string | null;
  symbol: string;
  market: Market;
  failure_reason: string;
  failure_type: SignalFailureType;
  error_details: Record<string, unknown> | null;
  created_at: string;
}

/**
 * 신호 생성 실패 기록
 *
 * @param params - 실패 기록 파라미터
 */
export async function logSignalGenerationFailure(params: {
  aiAnalysisId?: string;
  symbol: string;
  market: Market;
  failureReason: string;
  failureType: SignalFailureType;
  errorDetails?: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('signal_generation_failures').insert({
    ai_analysis_id: params.aiAnalysisId ?? null,
    symbol: params.symbol,
    market: params.market,
    failure_reason: params.failureReason,
    failure_type: params.failureType,
    error_details: params.errorDetails ?? null,
  });

  if (error) {
    throw new Error(`신호 생성 실패 기록 오류: ${error.message}`);
  }
}

/**
 * 최근 N시간 내 신호 생성 실패율 조회
 *
 * @param params - 조회 파라미터
 * @returns 실패 통계
 */
export async function getSignalFailureStats(params: {
  market?: Market;
  hoursAgo?: number;
}): Promise<{
  totalFailures: number;
  byType: Record<SignalFailureType, number>;
}> {
  const supabase = getSupabase();

  const hoursAgo = params.hoursAgo ?? 24;
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from('signal_generation_failures')
    .select('failure_type')
    .gte('created_at', cutoff);

  if (params.market) {
    query = query.eq('market', params.market);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`신호 실패 통계 조회 실패: ${error.message}`);
  }

  const byType: Record<string, number> = {
    insufficient_technical_data: 0,
    validation_failed: 0,
    atr_missing: 0,
    error: 0,
  };

  if (data) {
    for (const row of data) {
      const type = row.failure_type;
      if (type in byType) {
        byType[type]++;
      }
    }
  }

  return {
    totalFailures: data?.length ?? 0,
    byType: byType as Record<SignalFailureType, number>,
  };
}
