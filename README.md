# Trading System

> 다중 시장 자동매매 시스템 (국내주식 · 미국주식 · 암호화폐)

**🤖 AI 바이브코딩 프로젝트 + 🎯 Trading Skills Integration**

이 프로젝트는 **ChatGPT**, **Claude Code**, **Codex**와 소통하며 설계하고 구현한 자동매매 시스템입니다. AI 페어 프로그래밍을 통해 아키텍처를 설계하고, 바이브코딩으로 빠르게 구현하며, **tradermonty** 및 **jmanhype**의 검증된 트레이딩 지식과 로직을 통합하여 **최고의 트레이딩 시스템**을 구축합니다.

**⚠️ 현재 상태:** 개발 중 (테스트 및 검증 필요)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-orange.svg)](https://turbo.build/)

---

## 🆕 New: Trading Skills Integration

**Phase 1 완료 (2026-02-15):**
- ✅ `technical-analyst` - Elliott Wave, 피보나치, 일목균형표 차트 분석 (tradermonty)
- ✅ `risk-management` - 포지션 사이징, ATR 손절매, 일일 손실 한도 (jmanhype QTS 포팅)
- ✅ 통합 가이드: [SKILLS_INTEGRATION_GUIDE.md](./docs/SKILLS_INTEGRATION_GUIDE.md)
- ✅ 통합 계획: [INTEGRATION_PLAN.md](./INTEGRATION_PLAN.md)

**핵심 통합 포인트:**
```typescript
// 1. 차트 분석 → 2. 리스크 검증 → 3. TypeScript 구현
"BTC 차트를 technical-analyst로 분석하고
 risk-management로 검증한 뒤
 coding-standards 지켜서 구현해줘"
```

**Coming Soon (Phase 2-3):**
- `market-analysis`, `stock-screening`, `backtest-framework`
- `signal-generation`, `performance-analytics`, `compliance-logging`

---

## 📋 목차

- [개요](#-개요)
- [주요 기능](#-주요-기능)
- [Trading Skills](#-trading-skills-new)
- [시스템 아키텍처](#-시스템-아키텍처)
- [기술 스택](#-기술-스택)
- [시작하기](#-시작하기)
- [프로젝트 구조](#-프로젝트-구조)
- [개발 가이드](#-개발-가이드)
- [배포](#-배포)
- [문서](#-문서)
- [라이선스](#-라이선스)

---

## 🎯 개요

**Trading System**은 AI 도구와의 협업을 통해 설계하고 구현한 자동매매 시스템입니다. 국내주식(KRX), 미국주식(US), 암호화폐(Crypto) 시장에서 자동으로 데이터를 수집하고, AI 분석을 통해 매매 신호를 생성하며, 의사결정에 따라 주문을 실행합니다.

### 개발 방식

- 🤖 **AI 페어 프로그래밍** - AI와 대화하며 설계 및 구현
- 💬 **바이브코딩** - Claude Code, Codex와 협업
- 📋 **코드 품질 관리** - `.claude/rules`와 `skills`로 일관된 코딩 규칙 적용
- 🏗️ **아키텍처 우선** - 마이크로서비스, DB 중심 설계
- 🛠️ **현대적 도구** - TypeScript strict, Turborepo, Supabase
- 🎯 **전문 지식 통합** - tradermonty + jmanhype 트레이딩 스킬

### 핵심 철학

1. **서비스 격리** - 각 기능을 독립적인 서비스로 분리
2. **DB 중심 통신** - 서비스 간 느슨한 결합
3. **타입 안전** - TypeScript strict mode + 런타임 검증
4. **AI 절제** - 의미 있을 때만 정확하게 호출
5. **검증된 로직** - 커뮤니티 검증 트레이딩 방법론 활용

---

## ✨ 주요 기능

### 📊 데이터 수집

- **upbit-collector**: 업비트 암호화폐 시세 (1분봉)
- **kis-collector**: 한국투자증권 국내주식 시세 (실시간 틱)
- **yf-collector**: Yahoo Finance 미국주식 시세 (15분봉)

### 🤖 AI 분석

- **ai-analyzer**: OpenAI 기반 기술적 분석
- 시장 모드별 분석 (장 시작 전/장중/장 마감/장 마감 후)
- AI 호출 최소화 (쿨다운 + 예산 제한)

### 💰 매매 실행

- **trade-executor**: AI 신호 기반 주문 실행
- 가드 체크 (시장 시간, 거래 활성화, 예산)
- Dry-run 모드 지원

### 📈 모니터링

- **monitoring-bot**: 시스템 상태 모니터링
- Telegram 알림 (거래, 에러, 일일 리포트)
- 워커 상태 및 배치 추적

### 🖥️ 대시보드

- **web**: Next.js 기반 대시보드
- 실시간 포지션 조회
- 거래 내역 및 수익률 확인

---

## 🎯 Trading Skills (NEW)

### Phase 1: 핵심 트레이딩 분석 (완료)

#### 1. `technical-analyst` ⭐⭐⭐
**출처:** tradermonty/claude-trading-skills  
**기능:** Elliott Wave, 피보나치, 일목균형표 기반 차트 분석

```
사용 예:
"BTC 차트를 technical-analyst로 분석해줘"

결과:
- Elliott Wave 5파동 분석
- 피보나치 되돌림/확장 목표가
- 일목균형표 신호
- 시나리오 기반 확률 평가 (60% 조정, 30% 상승, 10% 급락)
```

#### 2. `risk-management` ⭐⭐⭐
**출처:** jmanhype/qts (Python → TypeScript 포팅)  
**기능:** 다층 리스크 관리 시스템

**핵심 규칙:**
- 레버리지 캡: BTC/ETH 1.5x, 알트 1.2x, 포트폴리오 1.0x
- 포지션 사이징: 심볼당 최대 25%, 총 100%
- ATR 기반 동적 손절매 (0.5% ~ 5%)
- 일일 손실 한도: -5% 도달 시 자동 청산 + 60분 쿨다운
- 리스크/보상 비율: 최소 1.5 이상

```typescript
import { validateNewPosition } from '@workspace/risk-management';

const validation = await validateNewPosition({
  symbol: 'BTC',
  entry: new Big(93000),
  target: new Big(98000),
  stopLoss: new Big(91500),
  leverage: new Big(1.5),
});

if (!validation.approved) {
  console.error('Rejected:', validation.violations);
}
```

### 통합 워크플로우

```
Step 1: 차트 분석
"technical-analyst로 BTC 차트 분석"
→ Elliott Wave 5파동 완성, 조정 예상

Step 2: 리스크 검증
"risk-management로 포지션 검증"
→ 레버리지 OK, R/R 2.1 (✅), 포지션 사이즈 $10,000

Step 3: 코드 생성
"coding-standards 지켜서 TypeScript 구현"
→ 타입 안전, Zod 검증, big.js 사용

Step 4: DB 저장
"database-operations로 스키마 설계"
→ trading_signals, risk_events 테이블 생성
```

### 문서

- 📖 [통합 가이드](./docs/SKILLS_INTEGRATION_GUIDE.md) - 사용법 및 예제
- 📋 [통합 계획](./INTEGRATION_PLAN.md) - Phase 2-3 로드맵
- 🎯 [Technical Analyst 스킬](./.claude/skills/technical-analyst/SKILL.md)
- 🛡️ [Risk Management 스킬](./.claude/skills/risk-management/SKILL.md)

---

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────┐
│              Supabase (PostgreSQL)              │
│  - positions, account_cash                      │
│  - upbit_candles, kis_candles, yf_candles      │
│  - ai_analysis, trades                          │
│  - worker_status, ingestion_runs                │
│  + trading_signals, risk_events (NEW)           │
└─────────────────────────────────────────────────┘
         ▲         ▲        ▲         ▲
         │         │        │         │
    ┌────┴──┐  ┌───┴───┐  ┌┴──┐   ┌──┴───┐
    │Collect│  │   AI  │  │Trade│ │Monitor│
    │(3종)  │  │Analyze│  │ Exec│ │  Bot  │
    └───────┘  └───────┘  └────┘  └──────┘
                    ▲                ▲
                    │                │
          ┌─────────┴────┐    ┌─────┴──────┐
          │Technical     │    │Risk        │
          │Analyst (NEW) │    │Mgmt (NEW)  │
          └──────────────┘    └────────────┘
```

**데이터 흐름:**

```
Collectors → DB → AI Analyzer → DB → Trade Executor → DB → Monitoring Bot
                      ↓                     ↓
              Technical Analyst      Risk Management
                   (차트 분석)           (리스크 검증)
```

**핵심 원칙:**

- ✅ 서비스 간 직접 import 금지 (DB 경유)
- ✅ 공통 로직은 `@workspace/*` 패키지로 추출
- ✅ 모든 외부 API 응답은 Zod로 런타임 검증
- ✅ 트레이딩 로직은 검증된 스킬 활용 (NEW)

---

(이하 기존 내용 유지...)
