# 🎯 Trading Skills - 최종 통합 완료

## 통합 현황

### ✅ 완료된 스킬 (13개)

#### Tier 1: 개발 기반 (10개 - 기존 유지)

- `coding-standards` ⭐
- `common-packages` ⭐
- `database-operations` ⭐
- `external-api-integration` ⭐
- `project-context` ⭐
- `react-best-practices`
- `composition-patterns`
- `dashboard-ui-skill`
- `error-handling-patterns`
- `web-design-guidelines`

#### Tier 2: 트레이딩 분석 (7개 - NEW)

1. **technical-analyst** ⭐⭐⭐
   - Elliott Wave, 피보나치, 일목균형표
   - tradermonty/technical-analyst

2. **sector-analyst** ⭐⭐
   - 시장 사이클 기반 섹터 로테이션
   - tradermonty/sector-analyst

3. **market-analysis** ⭐⭐
   - Breadth + 뉴스 임팩트 통합
   - tradermonty/breadth-chart-analyst + market-news-analyst

4. **canslim-screener** ⭐⭐⭐
   - William O'Neil 성장주 스크리닝
   - Phase 2 (6/7 components)
   - tradermonty/canslim-screener

5. **backtest-framework** ⭐⭐⭐
   - Walk-forward testing, 슬리피지 모델링
   - tradermonty/backtest-expert + jmanhype/qts

6. **signal-generation** ⭐⭐⭐
   - 분석 → 매매 신호 변환
   - jmanhype/qts signal logic

7. **compliance-logging** ⭐⭐
   - ACE 프레임워크 거래 추적
   - jmanhype/qts ACE framework

#### Tier 3: 리스크 & 실행 (3개 - NEW)

1. **risk-management** ⭐⭐⭐
   - 다층 리스크 제어, ATR 손절매, 일일 한도
   - jmanhype/qts risk_manager.py (TypeScript 포팅)

2. **signal-generation** ⭐⭐⭐
   - 기술적 분석 → 검증된 매매 신호
   - jmanhype/qts

3. **compliance-logging** ⭐⭐
   - ACE 로깅
   - jmanhype/qts

### 📚 선택적 스킬 (추가 가능, 별도 Phase)

#### 주식 스크리닝 (tradermonty)

- `dividend-screener` - 배당주 스크리닝
- `dividend-growth-pullback` - 배당 성장주
- `pairs-trading` - 통계적 차익거래

#### 포트폴리오 & 옵션 (tradermonty)

- `portfolio-manager` - Alpaca 연동 포트폴리오 관리
- `options-strategy` - Black-Scholes 옵션 전략

#### 경제 캘린더 (tradermonty)

- `economic-calendar` - FMP API 경제 이벤트
- `earnings-calendar` - 실적 발표 일정

#### 고급 분석 (tradermonty)

- `institutional-flow` - 13F 기관 매수 추적
- `us-market-bubble` - 버블 리스크 평가
- `stanley-druckenmiller` - 드러켄밀러 철학

## 스킬 사용 가이드

### 기본 워크플로우

```
Step 1: 차트 분석
"technical-analyst로 BTC 차트 분석"
→ Elliott Wave 5파동 완성, 조정 예상

Step 2: 섹터/시장 확인
"sector-analyst로 현재 사이클 위치 파악"
"market-analysis로 breadth 확인"
→ Mid Cycle, Breadth Narrowing

Step 3: 신호 생성 & 검증
"signal-generation으로 매매 신호 생성"
→ SELL 신호 생성

"risk-management로 검증"
→ R/R 2.1, 레버리지 OK, 승인

Step 4: 실행 & 로깅
"trade-executor로 실행"
"compliance-logging으로 ACE 기록"
```

### 고급 워크플로우

```
Step 1: 성장주 발굴
"canslim-screener로 미국 성장주 40개 스크리닝"
→ Top 10 종목 (90점 이상)

Step 2: 개별 분석
"technical-analyst로 NVDA 차트 분석"
→ 강세 지속

Step 3: 백테스팅
"backtest-framework로 전략 검증"
→ Sharpe 1.8, MDD 12%

Step 4: 실전 투입
"risk-management로 포지션 사이징"
→ 포트폴리오 10% 할당

Step 5: 추적
"compliance-logging으로 ACE 로그"
→ 전략, 근거, 실행 기록
```

## 통합 아키텍처

```
┌─────────────────────────────────────────────────┐
│              Supabase (PostgreSQL)              │
│  + trading_signals, risk_events, ace_logs      │
└─────────────────────────────────────────────────┘
         ▲         ▲        ▲         ▲
         │         │        │         │
    ┌────┴──┐  ┌───┴───┐  ┌┴──┐   ┌──┴───┐
    │Tech   │  │Market │  │Risk│ │Signal│
    │Analyst│  │Analysis│ │ Mgmt│ │  Gen │
    └───────┘  └───────┘  └────┘  └──────┘
         ▲                     │
         │                     ▼
    ┌────┴─────────────────────┴─────┐
    │   Compliance Logging (ACE)     │
    └────────────────────────────────┘
```

## API 요구사항

| 스킬              | FMP API | Finviz        | Alpaca | 비고                 |
| ----------------- | ------- | ------------- | ------ | -------------------- |
| canslim-screener  | ✅      | ✅ (scraping) | ❌     | Phase 2, I component |
| economic-calendar | ✅      | ❌            | ❌     | 선택적               |
| earnings-calendar | ✅      | ❌            | ❌     | 선택적               |
| portfolio-manager | ❌      | ❌            | ✅     | 선택적               |
| dividend-screener | ✅      | 🟡            | ❌     | 선택적               |
| options-strategy  | 🟡      | ❌            | ❌     | 선택적, 이론값 계산  |

- ✅ 필수
- 🟡 선택적 (성능 향상)
- ❌ 불필요

## 파일 구조

```
.claude/skills/
├── [Tier 1: 개발 기반] (10개)
│   ├── coding-standards/
│   ├── database-operations/
│   └── ...
│
├── [Tier 2: 트레이딩 분석] (7개)
│   ├── technical-analyst/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── elliott-wave-theory.md
│   │       ├── fibonacci-retracements.md
│   │       ├── ichimoku-cloud.md
│   │       └── candlestick-patterns.md
│   │
│   ├── sector-analyst/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── sector-rotation-theory.md
│   │       └── market-cycles.md
│   │
│   ├── market-analysis/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── breadth-indicators.md
│   │       └── news-scoring.md
│   │
│   ├── canslim-screener/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── canslim-methodology.md
│   │       └── scoring-formula.md
│   │
│   ├── backtest-framework/
│   │   ├── SKILL.md
│   │   └── references/
│   │       ├── walk-forward-methodology.md
│   │       ├── slippage-modeling.md
│   │       └── failed-backtest-cases.md
│   │
│   ├── signal-generation/
│   │   ├── SKILL.md
│   │   └── references/
│   │       └── confidence-calculation.md
│   │
│   └── compliance-logging/
│       ├── SKILL.md
│       └── references/
│           └── ace-framework.md
│
└── [Tier 3: 리스크 & 실행] (3개)
    ├── risk-management/
    │   ├── SKILL.md
    │   ├── references/
    │   │   ├── position-sizing.md
    │   │   ├── atr-calculation.md
    │   │   └── leverage-rules.md
    │   └── examples/
    │       ├── risk-calculator.ts
    │       ├── atr-stop-loss.ts
    │       └── circuit-breaker.ts
    │
    ├── signal-generation/
    └── compliance-logging/
```

## 참고 자료

- **tradermonty**: https://github.com/tradermonty/claude-trading-skills
- **jmanhype**: https://github.com/jmanhype/claude-code-plugin-marketplace
- **Anthropic Skills**: https://docs.claude.com/en/docs/claude-code/skills

## 다음 단계

### 선택적 추가 (필요 시)

1. 배당주 관련 스킬 (dividend-screener, dividend-growth-pullback)
2. 포트폴리오 관리 (portfolio-manager with Alpaca)
3. 옵션 전략 (options-strategy)
4. 경제 캘린더 (economic-calendar, earnings-calendar)
5. 고급 분석 (institutional-flow, market-bubble, druckenmiller)

### 실제 구현

1. `packages/risk-engine` 생성
2. `services/signal-generator` 생성
3. `services/backtest-engine` 생성
4. DB 마이그레이션 (trading_signals, risk_events, ace_logs)
5. 통합 테스트

---

**현재 상태:**

- ✅ 13개 핵심 스킬 통합 완료
- ✅ SKILL.md 모두 5,000 토큰 이하
- ✅ Anthropic 표준 준수
- ✅ tradermonty + jmanhype 로직 포팅
- ✅ 즉시 사용 가능한 상태

**즉시 사용 가능:**

```
"BTC 차트를 technical-analyst로 분석하고,
 risk-management로 검증해서,
 signal-generation으로 신호 만들고,
 compliance-logging으로 ACE 기록해줘"
```
