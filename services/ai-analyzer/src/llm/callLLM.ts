import OpenAI from 'openai';
import { env } from '../config/env';
import { parseAiResult } from './parseResult';
import type { AiLLMResult } from './resultSchema';

const client = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export async function callLLM(prompt: string): Promise<AiLLMResult> {
  const res = await client.chat.completions.create({
    model: env.AI_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  const text = res.choices[0]?.message?.content;
  if (!text) throw new Error('LLM 응답이 비어있습니다.');

  // JSON 파싱 + 스키마 검증(=형식 깨지면 여기서 컷)
  return parseAiResult(text);
}
