import { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import { shouldConsiderAi } from '../config/schedule.js';
import { env } from '../config/env.js';
import { collectSnapshot } from './collectSnapshot.js';
import { selectTargets } from './selectTargets.js';
import { buildPrompt } from '../llm/buildPrompt.js';
import { callLLM } from '../llm/callLLM.js';
import { canCallLLM, recordLLMCall } from '../llm/aiBudget.js';
import { saveAiResults } from '../db/saveAiResults.js';
import { shouldCallByMarketEventGate } from './market-event-gate.js';
import { nowIso } from '@workspace/shared-utils';
import { buildMarketContext } from '@workspace/db-client';

export async function runAiAnalysis(market: Market, mode: MarketMode): Promise<void> {
  console.log(`[AI] ${market} | ${mode} 시작`);

  // OFF 같은 모드는 애초에 고려하지 않음
  if (!shouldConsiderAi(mode)) {
    console.log(`[AI] 모드가 비활성(OFF 등)이라 스킵 | market=${market} | mode=${mode}`);
    return;
  }

  const snapshot = await collectSnapshot(market);
  const maxTargets = env.AI_MAX_TARGETS_PER_MARKET;
  const targets = await selectTargets(maxTargets, snapshot);

  console.log(
    `[AI] 타겟 선정 완료 | market=${market} | targets=${targets.length} | symbols=${targets
      .map((t) => t.symbol)
      .slice(0, 5)
      .join(', ')}${targets.length > 5 ? '...' : ''}`,
  );

  if (targets.length === 0) {
    console.log(`[AI] 타겟 없음 | market=${market} | mode=${mode}`);
    return;
  }

  const marketGate = await shouldCallByMarketEventGate({ market, mode, targets, snapshot });
  if (!marketGate.ok) {
    console.log(
      `[AI] 시장 호출 조건 미충족 → 스킵 | market=${market} | mode=${mode} | reason=${marketGate.reason}`,
    );
    return;
  }
  console.log(
    `[AI] 시장 호출 조건 충족 | market=${market} | mode=${mode} | reason=${marketGate.reason}`,
  );

  // ✅ 쿨다운/예산 게이트(최종)
  if (!(await canCallLLM(market, mode))) {
    console.log(`[AI] 쿨다운/예산으로 스킵 | market=${market} | mode=${mode}`);
    return;
  }

  // ✅ 마켓 컨텍스트 수집 (경제 이벤트, 실적 발표 등)
  const marketContext = await buildMarketContext();
  console.log(
    `[AI] 마켓 컨텍스트 수집 완료 | upcomingEvents=${marketContext.upcomingEvents.length}개`,
  );

  const prompt = buildPrompt({
    market,
    mode,
    snapshot,
    targets,
    nowIso: nowIso(),
    marketContext,
  });

  console.log(`[AI] LLM 호출 시작 | market=${market} | mode=${mode}`);
  const result = await callLLM(prompt);
  console.log(`[AI] LLM 응답 수신 | market=${market} | results=${result.results.length}개 대상`);

  // 저장(targets별 N건) + 호출 기록
  await saveAiResults(market, mode, result);

  const estimatedCostUsd = env.AI_ESTIMATED_COST_PER_CALL_USD;
  await recordLLMCall(market, estimatedCostUsd);

  console.log(`[AI] ${market} | ${mode} 완료 (${result.results.length}개 대상)`);
}
