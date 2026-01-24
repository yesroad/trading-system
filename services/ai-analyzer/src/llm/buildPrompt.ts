import type { Market } from '../config/markets';
import type { MarketMode } from '../config/schedule';
import type { SelectedTarget } from '../analysis/selectTargets';

export type BuildPromptParams = {
  market: Market;
  mode: MarketMode;
  snapshot: unknown;
  targets: SelectedTarget[];
  nowIso: string; // 호출 시각(UTC ISO)
};

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '"<직렬화 실패>"';
  }
}

/**
 * ✅ 강제 구조 프롬프트
 * - "오직 JSON 하나"만 출력하도록 강제
 * - targets별 결과 배열(results[])을 반드시 반환
 */
export function buildPrompt(params: BuildPromptParams): string {
  const { market, mode, snapshot, targets, nowIso } = params;

  return `
너는 자동매매 시스템의 "리스크 분석 AI"다.
입력 데이터를 바탕으로 ${market} 시장을 ${mode} 모드로 평가하라.

[현재 시각]
- now_utc: ${nowIso}

[스냅샷 데이터]
- snapshot_json: ${safeJson(snapshot)}

[분석 대상]
- targets_json: ${safeJson(targets)}

[분석 지침]
- 각 target(symbol)에 대해 "매매 개입 판단"을 내려라.
- decision: ALLOW(개입 없음) | CAUTION(주의/포지션 축소/신중) | BLOCK(매매 중단/강한 경고)
- confidence: 0~1
- summary: 해당 symbol에 대한 한 줄 요약
- reasons: 짧은 근거 리스트(문장 짧게)

[출력 규칙 - 매우 중요]
- 출력은 반드시 JSON "단일 객체"만.
- JSON 외 텍스트(설명/문장/마크다운/코드블록) 절대 금지.
- 아래 스키마의 키 이름을 정확히 지켜라.

[출력 JSON 스키마]
{
  "market": "${market}",
  "mode": "${mode}",
  "results": [
    {
      "symbol": "AAPL",
      "decision": "ALLOW|CAUTION|BLOCK",
      "confidence": 0.0,
      "summary": "한 줄 요약",
      "reasons": ["..."]
    }
  ]
}

이제 규칙을 지키며 JSON만 출력하라.
`.trim();
}
