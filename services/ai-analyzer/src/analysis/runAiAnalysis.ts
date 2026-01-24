import { Market } from '../config/markets';
import type { MarketMode } from '../config/schedule';
import { shouldConsiderAi } from '../config/schedule';
import { env } from '../config/env';
import { collectSnapshot } from './collectSnapshot';
import { selectTargets } from './selectTargets';
import { buildPrompt } from '../llm/buildPrompt';
import { callLLM } from '../llm/callLLM';
import { canCallLLM, recordLLMCall } from '../llm/aiBudget';
import { saveAiResults } from '../db/saveAiResults';
import { shouldCallAIBySnapshot } from './shouldCallAIBySnapshot';

export async function runAiAnalysis(market: Market, mode: MarketMode): Promise<void> {
  console.log(`[AI] ${market} | ${mode} 시작`);

  // OFF 같은 모드는 애초에 고려하지 않음
  if (!shouldConsiderAi(mode)) {
    console.log(`[AI] 모드가 비활성(OFF 등)이라 스킵 | market=${market} | mode=${mode}`);
    return;
  }

  const snapshot = await collectSnapshot(market);
  const maxTargets = env.AI_MAX_TARGETS_PER_MARKET;
  const targets = await selectTargets(market, maxTargets, snapshot);

  if (targets.length === 0) {
    console.log(`[AI] 타겟 없음 | market=${market} | mode=${mode}`);
    return;
  }

  // ✅ 데이터 변화 기준 게이트(가장 중요)
  if (!shouldCallAIBySnapshot({ market, mode, snapshot, targets })) {
    return;
  }

  // ✅ 쿨다운/예산 게이트(최종)
  if (!canCallLLM(market, mode)) {
    console.log(`[AI] 쿨다운/예산으로 스킵 | market=${market} | mode=${mode}`);
    return;
  }

  const prompt = buildPrompt({
    market,
    mode,
    snapshot,
    targets,
    nowIso: new Date().toISOString(),
  });

  const result = await callLLM(prompt);

  // 저장(targets별 N건) + 호출 기록
  await saveAiResults(market, mode, result);
  recordLLMCall(market);

  console.log(`[AI] ${market} | ${mode} 완료 (${result.results.length}개 대상)`);
}
