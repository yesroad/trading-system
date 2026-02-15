---
name: project-context
description: trading-system 모노레포의 현재 구조와 컴포넌트 책임을 빠르게 파악할 때 사용.
metadata:
  author: yesroad
  version: 1.1.0
  category: project-knowledge
---

# Project Context (Lean)

상세 스택/정책은 `AGENTS.md`를 단일 출처로 본다.
이 스킬은 **빠른 라우팅**에 집중한다.

## Workspace Map
- `apps/web`: Next.js 대시보드
- `packages/shared-utils`: env/date/logger/backoff
- `packages/db-client`: Supabase 접근 레이어
- `packages/kis-auth`: KIS 토큰 관리
- `packages/trading-utils`: 기술적 지표/리스크 계산 (Phase 2)
- `services/upbit-collector`: 업비트 수집
- `services/kis-collector`: KIS 국내주식 수집
- `services/yf-collector`: Yahoo Finance 수집
- `services/ai-analyzer`: AI 분석 + 신호 생성
- `services/trade-executor`: 리스크 관리 + 주문 실행 (Phase 3-7)
  - `signals/`: 신호 생성 (AI + 기술적 분석)
  - `risk/`: 리스크 관리 (포지션 사이징, 서킷 브레이커)
  - `compliance/`: ACE 로깅 (감사 추적)
  - `execution/`: 주문 실행
- `services/monitoring-bot`: 모니터링/알림

## Data Flow
```
Collectors → Supabase (candles)
    ↓
AI Analyzer → trading_signals (Phase 3)
    ↓
Trade Executor:
  - Risk Validation (Phase 4)
  - ACE Logging (Phase 5)
  - Order Execution (Phase 7)
    ↓
Supabase (trades, ace_logs)
    ↓
Monitoring/Web
```

## Fast Start Commands
- 전체: `yarn dev`, `yarn build`, `yarn lint`, `yarn check-types`
- 개별: `yarn workspace <name> dev|build|check-types`

## Routing Rule
- 구조/책임 질문: 이 스킬 사용
- 구현 규칙 질문: `coding-standards` + `.claude/rules/immutable-rules.md`
- DB 쿼리/스키마 질문: `database-operations`
- 공유 패키지 사용법: `common-packages`
