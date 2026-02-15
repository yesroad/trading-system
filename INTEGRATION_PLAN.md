# 🚀 Trading Skills Integration Plan

## 목표
trading-system에 tradermonty + jmanhype의 트레이딩 전문 지식과 로직을 통합하여 **최고의 트레이딩 시스템** 구축

## 통합 전략

### Phase 1: 트레이딩 분석 스킬 추가 (5개)
- ✅ `technical-analyst` - 차트 분석 전문가 (tradermonty)
- ✅ `market-analysis` - 시장 분석 통합 (tradermonty 3개 스킬 통합)
- ✅ `risk-management` - 리스크 관리 (jmanhype QTS 포팅)
- ✅ `stock-screening` - 종목 스크리닝 (tradermonty)
- ✅ `backtest-framework` - 백테스팅 방법론 (tradermonty + jmanhype)

### Phase 2: 데이터 & 모니터링 스킬 (3개)
- ✅ `data-collectors` - 기존 collector 통합
- ✅ `monitoring-alerts` - 모니터링 & 알림
- ✅ `ai-analysis-integration` - AI 분석 통합

### Phase 3: 실행 & 최적화 스킬 (5개)
- ✅ `signal-generation` - 매매 신호 생성
- ✅ `performance-analytics` - 성과 분석
- ✅ `strategy-optimization` - 전략 최적화
- ✅ `compliance-logging` - ACE 로깅 (jmanhype)
- ✅ `deployment-safety` - 배포 안전 가이드

## 스킬 구조

```
.claude/skills/
├── [기존 유지] (10개)
│   ├── coding-standards
│   ├── common-packages
│   ├── composition-patterns
│   ├── dashboard-ui-skill
│   ├── database-operations
│   ├── error-handling-patterns
│   ├── external-api-integration
│   ├── project-context
│   ├── react-best-practices
│   └── web-design-guidelines
│
├── [Phase 1: 트레이딩 분석] (5개)
│   ├── technical-analyst/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── elliott-wave-theory.md
│   │   │   ├── ichimoku-cloud.md
│   │   │   ├── fibonacci-retracements.md
│   │   │   └── candlestick-patterns.md
│   │   └── assets/
│   │
│   ├── market-analysis/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── sector-rotation.md
│   │   │   ├── breadth-indicators.md
│   │   │   └── news-impact-scoring.md
│   │   └── scripts/
│   │       └── market-overview.ts
│   │
│   ├── risk-management/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── position-sizing.md
│   │   │   ├── atr-stop-loss.md
│   │   │   └── kelly-criterion.md
│   │   └── examples/
│   │       └── risk-calculator.ts
│   │
│   ├── stock-screening/
│   │   ├── SKILL.md
│   │   ├── references/
│   │   │   ├── canslim-methodology.md
│   │   │   └── dividend-strategies.md
│   │   └── scripts/
│   │       └── canslim-screener.ts
│   │
│   └── backtest-framework/
│       ├── SKILL.md
│       ├── references/
│       │   ├── walk-forward-testing.md
│       │   ├── slippage-modeling.md
│       │   └── failed-backtest-cases.md
│       └── examples/
│           └── backtest-template.ts
│
├── [Phase 2: 데이터 & 모니터링] (3개)
│   ├── data-collectors/
│   ├── monitoring-alerts/
│   └── ai-analysis-integration/
│
└── [Phase 3: 실행 & 최적화] (5개)
    ├── signal-generation/
    ├── performance-analytics/
    ├── strategy-optimization/
    ├── compliance-logging/
    └── deployment-safety/
```

## 주요 변경 사항

### 1. 새 패키지 추가
```
packages/
└── risk-engine/              # 신규
    ├── src/
    │   ├── position-sizing.ts
    │   ├── stop-loss-calculator.ts
    │   └── leverage-manager.ts
    └── package.json
```

### 2. 새 서비스 추가
```
services/
├── signal-generator/         # 신규
│   └── src/
│       ├── elliott-wave-detector.ts
│       └── signal-validator.ts
│
└── backtest-engine/          # 신규
    └── src/
        ├── walk-forward-tester.ts
        └── performance-calculator.ts
```

### 3. DB 스키마 확장
```sql
-- 신규 테이블
CREATE TABLE trading_signals (...);
CREATE TABLE backtest_results (...);
CREATE TABLE risk_events (...);
CREATE TABLE ace_logs (...);
```

## 실행 계획

### Week 1: Phase 1 스킬 통합
- Day 1-2: technical-analyst, market-analysis
- Day 3-4: risk-management
- Day 5: stock-screening, backtest-framework

### Week 2: Phase 2-3 스킬 + 코드 구현
- Day 1-2: 데이터 & 모니터링 스킬
- Day 3-4: 실행 & 최적화 스킬
- Day 5: 통합 테스트 & 문서화

## 성공 기준

✅ 23개 스킬 모두 Anthropic 표준 준수
✅ TypeScript로 핵심 로직 포팅 완료
✅ DB 스키마 설계 완료
✅ 통합 예제 코드 작성
✅ README 업데이트
✅ 테스트 가능한 데모 시나리오

## 참고 자료

- tradermonty/claude-trading-skills: https://github.com/tradermonty/claude-trading-skills
- jmanhype/claude-code-plugin-marketplace: https://github.com/jmanhype/claude-code-plugin-marketplace
- Anthropic Skills 공식 문서: https://docs.claude.com/en/docs/claude-code/skills
