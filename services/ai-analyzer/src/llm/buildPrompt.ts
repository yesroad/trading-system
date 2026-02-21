import type { Market } from '../config/markets.js';
import type { MarketMode } from '../config/schedule.js';
import type { SelectedTarget } from '../analysis/selectTargets.js';

export type MarketContext = {
  upcomingEvents: Array<{
    title: string;
    impactScore: number;
    publishedAt: string;
    affectedSectors: string[] | null;
  }>;
  hasHighImpactEventToday: boolean;
  hasHighImpactEventTomorrow: boolean;
  eventSummary: string;
};

export type BuildPromptParams = {
  market: Market;
  mode: MarketMode;
  snapshot: unknown;
  targets: SelectedTarget[];
  nowIso: string; // 호출 시각(UTC ISO)
  marketContext?: MarketContext;
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
  const { market, mode, snapshot, targets, nowIso, marketContext } = params;

  // 마켓 컨텍스트 섹션 생성
  const marketContextSection = marketContext
    ? `
[경제 이벤트 및 실적 발표]
- 요약: ${marketContext.eventSummary}
- 오늘 고임팩트 이벤트: ${marketContext.hasHighImpactEventToday ? '있음' : '없음'}
- 내일 고임팩트 이벤트: ${marketContext.hasHighImpactEventTomorrow ? '있음' : '없음'}
${
  marketContext.upcomingEvents.length > 0
    ? `- 상위 이벤트:\n${marketContext.upcomingEvents
        .slice(0, 5)
        .map(
          (e) =>
            `  * ${e.title} (임팩트: ${e.impactScore}/10, 날짜: ${e.publishedAt}, 영향 섹터: ${e.affectedSectors?.join(', ') || '전체'})`,
        )
        .join('\n')}`
    : ''
}
`
    : '';

  return `
너는 자동매매 시스템의 "리스크 분석 AI"다.
입력 데이터를 바탕으로 ${market} 시장을 ${mode} 모드로 평가하라.

[현재 시각]
- now_utc: ${nowIso}
${marketContextSection}
[스냅샷 데이터]
- snapshot_json: ${safeJson(snapshot)}

[분석 대상]
- targets_json: ${safeJson(targets)}

[타겟 기술지표 컨텍스트]
- targets_json[*].technical 이 존재하면 해당 값을 우선 참고하라.
- technical.trendBias:
  - BUY_BIAS: 상승 방향 우세
  - SELL_BIAS: 하락 방향 우세
  - NEUTRAL: 방향성 혼조
- technical.quality:
  - HIGH: 신뢰도 높음
  - MEDIUM: 신뢰도 중간
  - LOW: 신뢰도 낮음
- technical.quality가 HIGH 또는 MEDIUM이고 trendBias가 BUY_BIAS/SELL_BIAS이면 기본값은 해당 방향(BUY/SELL)이다.
- 이 경우 HOLD는 예외 케이스로만 허용한다.

[분석 지침]
- 각 target(symbol)에 대해 "매매 개입 판단"을 내려라.
- decision: BUY(매수/추가매수) | SELL(청산/비중축소) | HOLD(보유 유지) | SKIP(신규 진입 회피)
- confidence: 0~1
- summary: 해당 symbol에 대한 한 줄 요약
- reasons: 짧은 근거 리스트(문장 짧게, 최소 2개)

[R/R 및 방향성 규칙]
- BUY/SELL은 손절 기준이 명확하고 기대수익/리스크 비율(R/R)이 1.5 이상일 때만 선택하라.
- R/R 1.5 미만 또는 손절 기준 불명확이면 BUY/SELL 금지, HOLD 또는 SKIP으로 처리하라.
- 상승 모멘텀 + 거래량 증가가 동시 확인되면 BUY를 적극 고려하라.
- 하락 모멘텀 + 거래량 증가가 동시 확인되면 SELL을 적극 고려하라.
- 명확한 근거가 있으면 HOLD를 남발하지 말고 BUY/SELL로 방향을 제시하라.

[HOLD 제한 규칙]
- HOLD는 "명확한 근거 부족 / 신호 충돌 / 리스크 과다 / 엣지 부족"일 때만 선택하라.
- technical.quality가 HIGH인데 HOLD인 경우는 매우 예외적이어야 한다.
- technical.trendBias가 BUY_BIAS 또는 SELL_BIAS인데 HOLD를 선택하면,
  reasons에 "왜 방향 결정을 보류했는지"를 구체적으로 작성하라.
- technical이 없거나 quality가 LOW면 보수적으로 HOLD 가능하지만,
  reasons에 부족한 데이터 항목을 명시하라.

[reasons 태그 규칙]
- decision이 BUY 또는 SELL이면 reasons에 아래 태그를 반드시 포함하라:
  - RR_POLICY:PASS(>=1.5)
  - STOP_BASIS:<손절 근거>
  - TP_BASIS:<익절 근거>
- decision이 HOLD면 reasons 첫 항목을 반드시 아래 중 하나로 시작하라:
  - HOLD_REASON:INSUFFICIENT_DATA
  - HOLD_REASON:CONFLICTING_SIGNALS
  - HOLD_REASON:RISK_TOO_HIGH
  - HOLD_REASON:NO_EDGE
- decision이 SKIP이면 reasons 첫 항목은 반드시 SKIP_REASON:<사유> 형식을 사용하라.

- 명확한 근거가 존재할 경우 과도하게 보수적으로 HOLD를 선택하지 말고 BUY 또는 SELL로 방향성을 제시하라.
- decision은 반드시 BUY/SELL/HOLD/SKIP 중 하나의 대문자만 사용한다.
- ALLOW/CAUTION/BLOCK 같은 값은 절대 사용하지 않는다.

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
      "decision": "BUY|SELL|HOLD|SKIP",
      "confidence": 0.0,
      "summary": "한 줄 요약",
      "reasons": ["..."]
    }
  ]
}

이제 규칙을 지키며 JSON만 출력하라.
`.trim();
}
