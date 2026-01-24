import type { Nullable } from "./utils";
import type { JsonValue } from "./json";

export type Market = "US" | "KR";

export type AiDecision = "ALLOW" | "CAUTION" | "BLOCK";

export type AiFilterDecision = {
  decision: AiDecision;
  confidence: number; // 0~1
  reason: string; // 한글 한 줄
  tags?: string[];
  raw?: JsonValue;
};

export type AiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type OpenAiResponse = {
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: AiUsage;
  model?: string;
};

export type EquityBar = {
  ts: string; // ISO
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: Nullable<number>;
};

export type OhlcSummary = {
  count: number;

  // 가격 변화
  start: number;
  end: number;
  return_pct: number;

  // 변동/레인지
  high: number;
  low: number;
  range_pct: number;

  // 변동성(간단)
  mean_abs_return_pct: number;

  // 추세(간단)
  slope_per_min_pct: number; // 분당 기울기(%)

  // 최근 상태
  last_close: number;
};
