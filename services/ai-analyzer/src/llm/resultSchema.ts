import { z } from 'zod';
import { MARKET_MODES } from '../config/schedule.js';

export const MarketSchema = z.enum(['KRX', 'US', 'CRYPTO']);
export type Market = z.infer<typeof MarketSchema>;

export const MarketModeSchema = z.enum(MARKET_MODES);
export type MarketMode = z.infer<typeof MarketModeSchema>;

export const AiDecisionSchema = z.enum(['BUY', 'SELL', 'HOLD', 'SKIP']);
export type AiDecision = z.infer<typeof AiDecisionSchema>;
type CanonicalAiDecision = 'BUY' | 'SELL' | 'HOLD' | 'SKIP';

const DECISION_ALIAS_MAP: Record<string, CanonicalAiDecision> = {
  BUY: 'BUY',
  SELL: 'SELL',
  HOLD: 'HOLD',
  SKIP: 'SKIP',
  LONG: 'BUY',
  SHORT: 'SELL',
  ALLOW: 'HOLD',
  CAUTION: 'HOLD',
  BLOCK: 'SKIP',
  '\uB9E4\uC218': 'BUY',
  '\uB9E4\uB3C4': 'SELL',
  '\uBCF4\uC720': 'HOLD',
  '\uAD00\uB9DD': 'SKIP',
  '\uB300\uAE30': 'SKIP',
  '\uC2A4\uD0B5': 'SKIP',
};

function normalizeDecision(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase();
  return DECISION_ALIAS_MAP[normalized] ?? normalized;
}

const NormalizedAiDecisionSchema = z.preprocess(normalizeDecision, AiDecisionSchema);

// ✅ LLM은 "시장 1회 호출"에 대해 targets별 결과 배열을 반환한다.
export const AiLLMResultSchema = z.object({
  market: MarketSchema,
  mode: MarketModeSchema,
  results: z.array(
    z.object({
      symbol: z.string().min(1),
      decision: NormalizedAiDecisionSchema,
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
