import { env, envOptional } from "./utils/env.js";
import type { AiFilterDecision } from "./types/ai.js";

const OPENAI_API_KEY = env("OPENAI_API_KEY");
const MODEL = envOptional("AI_MODEL", "gpt-4o-mini");

/**
 * AI 필터 호출
 * - 출력은 JSON만 받는다(파싱 안정성)
 */
export async function callAiFilter(params: {
  context: string;
}): Promise<{ result: AiFilterDecision; usage?: any; model?: string }> {
  const system = [
    '너는 자동매매 시스템의 "진입 필터" 역할을 한다.',
    "입력은 최근 가격 흐름 요약이며, 너는 진입을 허용할지 판단한다.",
    "출력은 반드시 JSON 하나만 반환한다.",
    "",
    "JSON 스키마:",
    "{",
    '  "decision": "ALLOW" | "CAUTION" | "BLOCK",',
    '  "confidence": number,  // 0~1',
    '  "reason": string,      // 한국어 한 줄',
    '  "tags": string[]       // 선택',
    "}",
    "",
    "판단 가이드:",
    "- 급격한 변동/레인지/노이즈가 크면 BLOCK 또는 CAUTION",
    "- 완만한 추세 + 변동성 과도하지 않으면 ALLOW",
    "- 확신이 낮으면 CAUTION",
    "- reason은 짧게(한 줄), 과장 금지",
  ].join("\n");

  const user = `입력 요약:\n${params.context}\n\nJSON만 출력해.`;

  const started = Date.now();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI failed: ${res.status} ${text}`);
  }

  const json = await res.json();

  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI invalid response: missing content");
  }

  const parsed = safeParseDecision(content);

  const latency_ms = Date.now() - started;
  return {
    result: { ...parsed, raw: { content, latency_ms } },
    usage: json?.usage,
    model: json?.model ?? MODEL,
  };
}

function safeParseDecision(text: string): AiFilterDecision {
  // 혹시 ```json ... ``` 같은 걸 넣는 경우 방어
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  let obj: any;
  try {
    obj = JSON.parse(cleaned);
  } catch {
    throw new Error(`AI output is not valid JSON: ${cleaned.slice(0, 200)}`);
  }

  const decision = obj?.decision;
  const confidence = obj?.confidence;
  const reason = obj?.reason;
  const tags = obj?.tags;

  if (!["ALLOW", "CAUTION", "BLOCK"].includes(decision)) {
    throw new Error(`AI decision invalid: ${String(decision)}`);
  }
  if (typeof confidence !== "number" || confidence < 0 || confidence > 1) {
    throw new Error(`AI confidence invalid: ${String(confidence)}`);
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error(`AI reason invalid: ${String(reason)}`);
  }

  return {
    decision,
    confidence,
    reason: reason.trim().slice(0, 120), // 너무 길면 UI/로그가 지저분해짐
    tags: Array.isArray(tags) ? tags.map(String).slice(0, 8) : [],
  };
}
