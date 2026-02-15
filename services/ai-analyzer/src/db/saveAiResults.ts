import { supabase } from '../supabase.js';
import type { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import type { AiLLMResult } from '../llm/resultSchema.js';
import { generateSignalFromAIAnalysis } from '@workspace/trading-utils';
import { logSignalGenerationFailure } from '@workspace/db-client';

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * Market → Broker 매핑
 */
function getBroker(market: Market): 'UPBIT' | 'KIS' {
  if (market === 'CRYPTO') return 'UPBIT';
  return 'KIS'; // KRX, US 모두 KIS
}

/**
 * Decision → Risk Level 매핑
 */
function decisionToRiskLevel(decision: string): RiskLevel {
  if (decision === 'SKIP') return 'HIGH';
  if (decision === 'HOLD') return 'MEDIUM';
  if (decision === 'SELL') return 'MEDIUM';
  return 'LOW'; // BUY
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

  const { data: insertedRows, error } = await supabase
    .from('ai_analysis_results')
    .insert(rows)
    .select('id, symbol, decision, confidence, summary');

  if (error) throw new Error(`AI 결과 저장 실패: ${error.message}`);

  const high = rows.filter((x) => x.risk_level === 'HIGH').length;
  const mid = rows.filter((x) => x.risk_level === 'MEDIUM').length;

  console.log(
    `[AI] 결과 저장 완료 | market=${market} | mode=${mode} | rows=${rows.length} | HIGH=${high} | MEDIUM=${mid}`,
  );

  // ✨ Phase 3: AI 분석 결과로부터 거래 신호 생성
  if (insertedRows && insertedRows.length > 0) {
    console.log(`[Signal] 신호 생성 시작 | count=${insertedRows.length}`);

    let signalCount = 0;
    let skipCount = 0;

    for (const row of insertedRows) {
      const aiAnalysisId = (row as { id?: string | number }).id;
      const symbol = (row as { symbol?: string }).symbol;
      const decision = (row as { decision?: string }).decision;
      const confidence = (row as { confidence?: number }).confidence;
      const summary = (row as { summary?: string }).summary;

      if (
        !aiAnalysisId ||
        typeof symbol !== 'string' ||
        typeof decision !== 'string' ||
        typeof confidence !== 'number'
      ) {
        console.warn(`[Signal] 유효하지 않은 AI 결과 건너뜀 | row=${JSON.stringify(row)}`);
        continue;
      }

      // HOLD나 SKIP은 신호 생성하지 않음
      if (decision === 'HOLD' || decision === 'SKIP') {
        skipCount++;
        continue;
      }

      // BUY, SELL만 신호 생성
      if (decision !== 'BUY' && decision !== 'SELL') {
        skipCount++;
        continue;
      }

      try {
        const signal = await generateSignalFromAIAnalysis({
          aiAnalysisId: String(aiAnalysisId),
          symbol,
          market,
          broker: getBroker(market),
          aiDecision: decision as 'BUY' | 'SELL',
          aiConfidence: confidence,
          priceAtAnalysis: '0', // 현재가를 사용하므로 임시값
          aiReasoning: summary,
        });

        if (signal) {
          signalCount++;
          console.log(
            `[Signal] 신호 생성 성공 | symbol=${symbol} | id=${signal.id} | confidence=${signal.confidence.toFixed(2)}`,
          );
        } else {
          // 신호 생성 실패 - 추적 기록
          skipCount++;
          await logSignalGenerationFailure({
            aiAnalysisId: String(aiAnalysisId),
            symbol,
            market,
            failureReason: '신호 검증 실패 또는 기술적 지표 부족',
            failureType: 'validation_failed',
          }).catch((err) => {
            console.error(`[Signal] 실패 추적 기록 오류`, err);
          });
        }
      } catch (error) {
        console.error(`[Signal] 신호 생성 실패 | symbol=${symbol}`, error);
        skipCount++;

        // 예외 발생 - 추적 기록
        await logSignalGenerationFailure({
          aiAnalysisId: String(aiAnalysisId),
          symbol,
          market,
          failureReason: error instanceof Error ? error.message : '알 수 없는 에러',
          failureType: 'error',
          errorDetails: {
            name: error instanceof Error ? error.name : 'UnknownError',
            stack: error instanceof Error ? error.stack : undefined,
          },
        }).catch((err) => {
          console.error(`[Signal] 실패 추적 기록 오류`, err);
        });
      }
    }

    console.log(
      `[Signal] 신호 생성 완료 | generated=${signalCount} | skipped=${skipCount} | total=${insertedRows.length}`,
    );
  }
}
