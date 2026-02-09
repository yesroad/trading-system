import { validateAiLLMResult } from './resultSchema.js';
import type { AiLLMResult } from './resultSchema.js';

/**
 * ✅ LLM 응답 문자열 → JSON 파싱 → 스키마 검증
 * - LLM이 JSON 외 텍스트를 섞으면 여기서 바로 실패
 */
export function parseAiResult(text: string): AiLLMResult {
  const trimmed = text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error('AI 응답이 JSON 파싱에 실패했습니다. (JSON만 출력해야 함)');
  }

  return validateAiLLMResult(parsed);
}
