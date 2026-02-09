import { z } from 'zod';
import { MARKET_MODES } from '../config/schedule.js';

export const MarketSchema = z.enum(['KR', 'US', 'CRYPTO']);
export type Market = z.infer<typeof MarketSchema>;

export const MarketModeSchema = z.enum(MARKET_MODES);
export type MarketMode = z.infer<typeof MarketModeSchema>;

export const AiDecisionSchema = z.enum(['ALLOW', 'CAUTION', 'BLOCK']);
export type AiDecision = z.infer<typeof AiDecisionSchema>;

// ✅ LLM은 "시장 1회 호출"에 대해 targets별 결과 배열을 반환한다.
export const AiLLMResultSchema = z.object({
  market: MarketSchema,
  mode: MarketModeSchema,
  results: z.array(
    z.object({
      symbol: z.string().min(1),
      decision: AiDecisionSchema,
      confidence: z.number().min(0).max(1),
      summary: z.string().min(1),
      reasons: z.array(z.string()),
    }),
  ),
});

export type AiLLMResult = z.infer<typeof AiLLMResultSchema>;

export function validateAiLLMResult(raw: unknown): AiLLMResult {
  const parsed = AiLLMResultSchema.parse(raw);

  return {
    ...parsed,
    results: parsed.results.map((r) => ({
      ...r,
      symbol: r.symbol.trim(),
      summary: r.summary.trim(),
      reasons: r.reasons.map((x) => String(x).trim()).filter(Boolean),
    })),
  };
}
