# AI Analyzer 규칙

## 목적

`ai-analyzer`는 수집 데이터 기반으로 AI 분석 결과를 생성해 `ai_analysis_results`에 저장한다.

## 명령어

```bash
dev:         yarn dev
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
```

## 로컬 스택

- 내부: `@workspace/shared-utils`
- 외부: `openai`, `@supabase/supabase-js`, `zod`

## 로컬 규칙

- 외부 응답/모델 출력은 런타임 검증을 적용한다.
- 분석 결과 스키마(`decision`, `confidence`, `market`, `symbol`) 정합성을 유지한다.
- 출력 스키마는 `market/mode/results[]`를 유지하고 임의의 단일 객체 스키마로 변경하지 않는다.
- HOLD 편향(예: BUY/SELL 0건, HOLD 비율 과다) 발생 시 재시도 정책을 통해 방향성 분포를 보정한다.
- LLM 입력에는 타겟별 기술지표 컨텍스트(`targets_json[*].technical`)를 우선 반영한다.
- HOLD/리스크 사유는 `reasons[]` 태그(`HOLD_REASON:*`, `RR_POLICY:*`, `STOP_BASIS:*`, `TP_BASIS:*`)로 표현한다.
- 공통 env/date 유틸은 `@workspace/shared-utils`를 우선 사용한다.
- 공유 패턴은 루트 `AGENTS.md`와 `.claude/rules/immutable-rules.md`를 따른다.

## React/UI 스킬 적용 범위

- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
