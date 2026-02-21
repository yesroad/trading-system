import OpenAI from 'openai';
import { env } from '../config/env.js';
import { parseAiResult } from './parseResult.js';
import type { AiLLMResult } from './resultSchema.js';

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

function buildDirectionalRetryPrompt(basePrompt: string): string {
  return `${basePrompt}

[재평가 지시 - 방향성 강화]
- 직전 결과에서 HOLD 비중이 과도했다.
- 각 symbol에 대해 BUY 또는 SELL 가능성을 먼저 평가하고, HOLD는 예외적으로만 사용하라.
- HOLD를 선택하려면 "근거 부족/신호 충돌/리스크 우세"를 reasons에 구체적으로 명시하라.
- reasons가 추상적이거나 반복적이면 HOLD를 사용하지 말고 BUY 또는 SELL로 결정하라.
- confidence는 근거 강도에 비례해야 하며, HOLD confidence는 0.65를 넘기지 마라.
`.trim();
}

function countDirectionalDecisions(result: AiLLMResult): {
  total: number;
  buySell: number;
  hold: number;
} {
  let buySell = 0;
  let hold = 0;

  for (const row of result.results) {
    if (row.decision === 'BUY' || row.decision === 'SELL') buySell += 1;
    if (row.decision === 'HOLD') hold += 1;
  }

  return {
    total: result.results.length,
    buySell,
    hold,
  };
}

async function requestCompletion(prompt: string, temperature: number): Promise<string> {
  const response = await client.chat.completions.create({
    model: env.AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature,
  });

  const text = response.choices[0]?.message?.content;
  if (!text) throw new Error('LLM 응답이 비어있습니다.');
  return text;
}

export async function callLLM(prompt: string): Promise<AiLLMResult> {
  const firstText = await requestCompletion(prompt, env.AI_LLM_TEMPERATURE);
  const firstParsed = parseAiResult(firstText);

  if (!env.AI_HOLD_RETRY_ENABLED) {
    return firstParsed;
  }

  const firstStats = countDirectionalDecisions(firstParsed);
  const holdRatio = firstStats.total > 0 ? firstStats.hold / firstStats.total : 0;
  const shouldRetry =
    firstStats.total > 0 && firstStats.buySell === 0 && holdRatio >= env.AI_HOLD_RETRY_THRESHOLD;

  if (!shouldRetry) {
    return firstParsed;
  }

  try {
    console.warn(
      `[AI] HOLD 편향 재시도 | hold=${firstStats.hold}/${firstStats.total} | threshold=${env.AI_HOLD_RETRY_THRESHOLD}`,
    );
    const retryPrompt = buildDirectionalRetryPrompt(prompt);
    const retryText = await requestCompletion(retryPrompt, env.AI_HOLD_RETRY_TEMPERATURE);
    const retryParsed = parseAiResult(retryText);
    const retryStats = countDirectionalDecisions(retryParsed);

    console.warn(
      `[AI] HOLD 편향 재시도 결과 | first_buy_sell=${firstStats.buySell}/${firstStats.total} | retry_buy_sell=${retryStats.buySell}/${retryStats.total}`,
    );

    // 재시도가 방향성을 늘리지 못하면 최초 결과를 유지해 급격한 품질 저하를 방지한다.
    if (retryStats.buySell < firstStats.buySell) {
      return firstParsed;
    }

    return retryParsed;
  } catch (error: unknown) {
    console.error('[AI] HOLD 편향 재시도 실패 - 최초 결과 사용', error);
    return firstParsed;
  }
}
