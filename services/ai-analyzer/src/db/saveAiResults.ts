import { supabase } from '../supabase.js';
import type { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import type { AiLLMResult } from '../llm/resultSchema.js';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

function decisionToRiskLevel(decision: string): RiskLevel {
  if (decision === 'BLOCK') return 'HIGH';
  if (decision === 'CAUTION') return 'MEDIUM';
  return 'LOW';
}

/**
 * ✅ ai_analysis_results 테이블에 "targets별 N건" 저장
 * 스키마:
 * - market text
 * - mode text
 * - symbol text
 * - decision text
 * - confidence numeric
 * - summary text
 * - reasons jsonb
 * - raw_response jsonb
 * - risk_level text
 */
export async function saveAiResults(
  market: Market,
  mode: MarketMode,
  result: AiLLMResult,
): Promise<void> {
  const items = Array.isArray(result.results) ? result.results : [];

  if (items.length === 0) {
    console.log(`[AI] 저장 스킵: 결과가 비어있습니다 | market=${market} | mode=${mode}`);
    return;
  }

  const rows = items.map((r) => {
    const riskLevel = decisionToRiskLevel(r.decision);

    return {
      market: String(market),
      mode: String(mode),
      symbol: r.symbol,
      decision: r.decision,
      confidence: r.confidence,
      summary: r.summary,
      reasons: r.reasons,
      risk_level: riskLevel,
      // raw_response는 “전체 응답”이 아니라 “해당 타겟 결과 + 메타”만 저장(용량/조회 효율)
      raw_response: {
        market: result.market,
        mode: result.mode,
        target: r,
      },
    };
  });

  const { error } = await supabase.from('ai_analysis_results').insert(rows);
  if (error) throw new Error(`AI 결과 저장 실패: ${error.message}`);

  const high = rows.filter((x) => x.risk_level === 'HIGH').length;
  const mid = rows.filter((x) => x.risk_level === 'MEDIUM').length;

  console.log(
    `[AI] 결과 저장 완료 | market=${market} | mode=${mode} | rows=${rows.length} | HIGH=${high} | MEDIUM=${mid}`,
  );
}
