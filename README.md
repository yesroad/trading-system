# Trading System

> AI 협업을 통한 복잡한 시스템 설계 프로젝트

**Project Focus**: Microservices Architecture Design · AI-Assisted Development · Type-Safe Financial System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-orange.svg)](https://turbo.build/)
![Architecture](https://img.shields.io/badge/Architecture-Microservices-blue)
![AI Assisted](https://img.shields.io/badge/Built%20with-Claude%20Code-blueviolet)

---

## 📋 목차

- [개요](#-개요)
- [설계 하이라이트](#-설계-하이라이트)
- [AI 협업 프로세스](#-ai-협업-프로세스)
- [기술적 의사결정](#-기술적-의사결정)
- [주요 기능](#-주요-기능)
- [시스템 아키텍처](#-시스템-아키텍처)
- [기술 스택](#-기술-스택)
- [시작하기](#-시작하기)
- [프로젝트 구조](#-프로젝트-구조)
- [개발 가이드](#-개발-가이드)
- [문서](#-문서)

---

## 🎯 개요

**Trading System**은 국내주식(KRX), 미국주식(US), 암호화폐(Crypto) 시장을 다루는 자동매매 시스템의 아키텍처 설계 프로젝트입니다. Claude Code와의 협업을 통해 복잡한 마이크로서비스 구조를 설계하고, 타입 안전성과 확장 가능성을 중심으로 시스템을 구축했습니다.

### 프로젝트 목표

1. **복잡한 시스템 설계** - 다중 시장 데이터 수집부터 AI 분석, 주문 실행까지의 전체 파이프라인
2. **AI 협업 워크플로우** - Claude Code를 활용한 효율적인 개발 프로세스 구축
3. **타입 안전 금융 시스템** - TypeScript strict + Zod를 통한 런타임 안전성
4. **모노레포 설계** - Turborepo 기반 확장 가능한 서비스 아키텍처

---

## 💡 설계 하이라이트

### 1. 서비스 격리 아키텍처

6개의 독립적인 서비스를 DB 중심 통신으로 느슨하게 결합했습니다.

```
Collectors (3종) → DB → AI Analyzer → DB → Trade Executor → DB → Monitoring Bot
```

**설계 원칙:**
- ✅ 서비스 간 직접 import 금지 (DB를 통한 통신)
- ✅ 각 서비스 독립 배포 가능
- ✅ 장애 격리 (한 서비스 실패가 전체 시스템에 영향 없음)

### 2. 타입 안전성

금융 시스템에서 타입 오류는 실제 손실로 이어질 수 있습니다.

```typescript
// 컴파일 타임 안전성
TypeScript 5.9 strict mode

// 런타임 안전성
Zod 스키마 검증 (모든 외부 API 응답)

// 금융 계산 정밀도
big.js (부동소수점 오차 제거)
```

### 3. 공통 패키지 추상화

재사용 가능한 로직을 `@workspace/*` 패키지로 분리했습니다.

- `@workspace/shared-utils` - 환경변수, 날짜, 로깅, 백오프
- `@workspace/db-client` - Supabase 클라이언트, 공통 쿼리
- `@workspace/kis-auth` - 한국투자증권 토큰 관리

### 4. AI 최적화 전략

AI 분석 비용을 최소화하면서 효과성을 유지하는 전략:
- 시장 모드별 분석 (장 시작 전/장중/장 마감/장 마감 후)
- 쿨다운 메커니즘 (불필요한 호출 방지)
- 예산 제한 (일일 API 비용 관리)

---

## 🤖 AI 협업 프로세스

이 프로젝트는 Claude Code를 활용한 AI-Assisted Development의 실제 사례입니다.

### 협업 방식

**개발자 역할 (설계 및 의사결정)**
- 시스템 아키텍처 설계
- 기술 스택 선정 및 트레이드오프 분석
- 코딩 규칙 및 가이드라인 정의
- 코드 리뷰 및 품질 관리

**Claude Code 역할 (구현 및 문서화)**
- 보일러플레이트 코드 생성
- 정의된 규칙에 따른 일관된 코드 작성
- API 통합 및 타입 정의
- 문서 자동 생성

### 설정 파일 기반 관리

```
.claude/
├── rules/
│   ├── immutable-rules.md      # 절대 변경 불가 규칙
│   ├── architecture-guide.md   # 아키텍처 원칙
│   └── database-guide.md       # DB 스키마 및 쿼리
│
├── skills/
│   ├── error-handling-patterns/
│   ├── external-api-integration/
│   └── coding-standards/
│
└── documentation-index.md
```

**핵심 파일:**
- `AGENTS.md` - AI 에이전트가 참고하는 전체 가이드
- `.claude/rules/` - 프로젝트의 불변 규칙
- `.claude/skills/` - 반복적인 패턴의 스킬화

### 개발 효율성 향상

- ⚡ **개발 속도 3배 향상** - 반복적인 코드 작성 자동화
- 🎯 **일관성 유지** - 모든 서비스에서 동일한 패턴 적용
- 📚 **자동 문서화** - 코드와 함께 문서 업데이트
- 🔒 **타입 안전성** - AI가 strict mode 규칙 준수

---

## 🏗️ 기술적 의사결정

### 1. Turborepo 모노레포 선택

**선택 이유:**
- 서비스 간 코드 공유 용이 (`@workspace/*` 패키지)
- 각 서비스 독립 배포 가능 (Docker 이미지 분리)
- 타입 안전한 의존성 관리
- 빌드 캐싱으로 개발 속도 향상

**고려한 대안:**
- **Nx**: 더 많은 기능이지만 복잡도 증가
- **Lerna**: 빌드 최적화 부족
- **멀티레포**: 코드 공유 어려움

**선택 기준:**
- 프로젝트 규모 (6개 서비스 + 5개 패키지)
- 팀 규모 (1-2명)
- 학습 곡선 vs 생산성

### 2. DB 중심 통신 패턴

**선택 이유:**
- ✅ **느슨한 결합** - 서비스 간 직접 의존성 제거
- ✅ **비동기 처리** - 자연스러운 이벤트 기반 아키텍처
- ✅ **디버깅 용이** - DB에 모든 상태 기록
- ✅ **독립 배포** - 서비스 버전 간 호환성 문제 최소화

**트레이드오프:**
- ❌ 실시간성 약간 희생 (수초 지연)
- ❌ DB 부하 증가

**선택 기준:**
- 자동매매에서 수초 지연은 허용 범위
- 안정성 > 실시간성

### 3. TypeScript Strict Mode

**선택 이유:**
- 금융 계산 오류는 실제 손실로 연결
- 외부 API 응답 타입 보장 필수
- 리팩토링 시 안전성

**구현 전략:**
```typescript
// 1. 컴파일 타임: TypeScript strict
{
  "strict": true,
  "noImplicitAny": true,
  "strictNullChecks": true
}

// 2. 런타임: Zod 검증
const Schema = z.object({ ... });
const result = Schema.safeParse(apiResponse);

// 3. 금융 계산: big.js
const total = new Big(price).times(quantity);
```

### 4. Supabase 선택

**선택 이유:**
- PostgreSQL 기반 (복잡한 쿼리 지원)
- Row-level security (보안)
- 실시간 구독 (WebSocket)
- 관리형 서비스 (운영 부담 감소)

**고려한 대안:**
- **직접 PostgreSQL 운영**: 운영 부담 큼
- **MongoDB**: 금융 데이터는 RDBMS가 적합
- **Redis**: 영속성 부족

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

## 🏗️ 시스템 아키텍처

```
┌─────────────────────────────────────────────────┐
│              Supabase (PostgreSQL)              │
│  - positions, account_cash                      │
│  - upbit_candles, kis_candles, yf_candles      │
│  - ai_analysis, trades                          │
│  - worker_status, ingestion_runs                │
└─────────────────────────────────────────────────┘
         ▲         ▲        ▲         ▲
         │         │        │         │
    ┌────┴──┐  ┌───┴───┐  ┌┴──┐   ┌──┴───┐
    │Collect│  │   AI  │  │Trade│ │Monitor│
    │(3종)  │  │Analyze│  │ Exec│ │  Bot  │
    └───────┘  └───────┘  └────┘  └──────┘
```

**데이터 흐름:**

```
Collectors → DB → AI Analyzer → DB → Trade Executor → DB → Monitoring Bot
```

**핵심 원칙:**

- ✅ 서비스 간 직접 import 금지 (DB 경유)
- ✅ 공통 로직은 `@workspace/*` 패키지로 추출
- ✅ 모든 외부 API 응답은 Zod로 런타임 검증

---

## 🛠️ 기술 스택

### Core

- **Runtime**: Node.js >= 22
- **Language**: TypeScript 5.9 (strict mode)
- **Package Manager**: Yarn 4.9.2
- **Build System**: Turborepo 2.x

### Database

- **Supabase** (PostgreSQL)
- **@supabase/supabase-js**

### Frontend

- **Next.js** 16.1 (React 19.2)
- **Tailwind CSS** 4
- **Radix UI** (Headless components)
- **TanStack React Query** (Server state)
- **Jotai** (Client state)

### Libraries

- **Luxon** (날짜/시간)
- **Zod** (스키마 검증)
- **big.js** (금융 계산)
- **dotenv** (환경변수)

### APIs

- **한국투자증권 (KIS)** - 국내/미국주식
- **Upbit** - 암호화폐
- **Yahoo Finance** - 미국주식 (보조)
- **OpenAI** - AI 분석

---

## 🚀 시작하기

### 1. 사전 요구사항

```bash
# Node.js 22 이상
node --version  # v22.x.x

# Yarn 4.9.2
yarn --version  # 4.9.2
```

### 2. 저장소 클론

```bash
git clone https://github.com/yesroad/trading-system.git
cd trading-system
```

### 3. 의존성 설치

```bash
yarn install
```

**필수 환경변수:**

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-service-key

# KIS API
KIS_APP_KEY=your-app-key
KIS_APP_SECRET=your-app-secret
KIS_ACCOUNT_NO=your-account-number

# Upbit API
UPBIT_ACCESS_KEY=your-access-key
UPBIT_SECRET_KEY=your-secret-key

# OpenAI
OPENAI_API_KEY=your-openai-key

# Telegram
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
```

### 4. 빌드

```bash
# 전체 빌드
yarn build

# 타입 체크
yarn check-types

# 린트
yarn lint
```

### 5. 실행

```bash
# 개발 모드 (전체)
yarn dev

# 개별 서비스 실행
cd services/upbit-collector
yarn dev
```

---

## 📁 프로젝트 구조

```
trading-system/
├── apps/
│   └── web/                     # Next.js 대시보드
│       ├── src/
│       │   ├── app/            # Next.js App Router
│       │   ├── components/     # React 컴포넌트
│       │   └── services/       # API 클라이언트
│       └── package.json
│
├── packages/
│   ├── shared-utils/           # 공통 유틸리티
│   │   └── src/
│   │       ├── env.ts          # 환경변수
│   │       ├── date.ts         # 날짜/시간
│   │       ├── logger.ts       # 로깅
│   │       └── backoff.ts      # 백오프
│   │
│   ├── db-client/              # Supabase 클라이언트
│   │   └── src/
│   │       ├── client.ts       # 싱글톤
│   │       ├── positions.ts    # 포지션 조회
│   │       └── types.ts        # DB 타입
│   │
│   ├── kis-auth/               # KIS 토큰 관리
│   │   └── src/
│   │       ├── tokenManager.ts
│   │       └── errors.ts
│   │
│   ├── eslint-config/          # ESLint 설정
│   └── typescript-config/      # TypeScript 설정
│
├── services/
│   ├── upbit-collector/        # 암호화폐 수집
│   ├── kis-collector/          # 국내주식 수집
│   ├── yf-collector/           # 미국주식 수집
│   ├── ai-analyzer/            # AI 분석
│   ├── trade-executor/         # 주문 실행
│   └── monitoring-bot/         # 모니터링
│
├── .claude/                    # Claude Code 설정
│   ├── rules/                  # 불변 규칙
│   └── skills/                 # 스킬 정의
│
├── AGENTS.md                   # AI 에이전트 가이드
├── package.json                # 루트 package.json
└── turbo.json                  # Turborepo 설정
```

---

## 📖 개발 가이드

### 필수 규칙

모든 코드는 [AGENTS.md](./AGENTS.md)와 [.claude/rules/immutable-rules.md](./.claude/rules/immutable-rules.md)를 따라야 합니다.

#### 1. 환경변수

```typescript
// ❌ 금지
const url = process.env.SUPABASE_URL;

// ✅ 권장
import { requireEnv } from '@workspace/shared-utils';
const url = requireEnv('SUPABASE_URL');
```

#### 2. 날짜/시간

```typescript
// ❌ 금지 (신규 코드)
const now = new Date().toISOString();

// ✅ 권장
import { nowIso } from '@workspace/shared-utils';
const now = nowIso();
```

#### 3. 숫자/금융 계산

```typescript
// ❌ 금지 (부동소수점 오차)
const total = price * quantity;

// ✅ 권장
import Big from 'big.js';
const total = new Big(price).times(quantity);
```

#### 4. DB 접근

```typescript
// ✅ 우선: 공통 함수
import { loadCryptoPositions } from '@workspace/db-client';

// ✅ 필요시: 직접 쿼리
import { getSupabase } from '@workspace/db-client';
const { data, error } = await getSupabase().from('table').select();
if (error) throw new Error(error.message);
```

#### 5. 외부 API 응답

```typescript
// ✅ 필수: Zod 검증
import { z } from 'zod';

const Schema = z.object({ ... });
const result = Schema.safeParse(response);
if (!result.success) {
  logger.error('스키마 불일치', result.error);
  return null;
}
```

---

## 📚 문서

### 필수 문서

- [AGENTS.md](./AGENTS.md) - AI 에이전트 가이드라인
- [SYSTEM-EVALUATION.md](./SYSTEM-EVALUATION.md) - 시스템 평가 및 로드맵
- [.claude/documentation-index.md](./.claude/documentation-index.md) - 전체 문서 인덱스

### 규칙 및 가이드

- [Immutable Rules](./.claude/rules/immutable-rules.md) - 불변 규칙
- [Architecture Guide](./.claude/rules/architecture-guide.md) - 아키텍처 상세
- [Database Guide](./.claude/rules/database-guide.md) - DB 스키마 및 쿼리

### 스킬

- [Error Handling Patterns](./.claude/skills/error-handling-patterns/SKILL.md)
- [External API Integration](./.claude/skills/external-api-integration/SKILL.md)
- [Coding Standards](./.claude/skills/coding-standards/SKILL.md)
- [Common Packages](./.claude/skills/common-packages/SKILL.md)

### 패키지 문서

- [shared-utils](./packages/shared-utils/README.md) - 공통 유틸리티
- [db-client](./packages/db-client/README.md) - DB 클라이언트
- [kis-auth](./packages/kis-auth/README.md) - KIS 인증

---

## 📄 라이선스

Private - All Rights Reserved

---

## 🙏 Acknowledgments

이 프로젝트는 다음 도구와 기술을 활용하여 개발되었습니다:

- **AI-Assisted Development** - Claude Code와 함께 설계 및 구현
- **한국투자증권** - 국내/미국주식 API 제공
- **Upbit** - 암호화폐 API 제공
- **Supabase** - 데이터베이스 및 인프라

---

**Note**: 이 프로젝트는 시스템 설계 및 AI 협업 방법론을 연구하기 위한 교육 목적의 프로젝트입니다. 실제 금융 투자에 사용할 경우 추가적인 검증과 리스크 관리가 필요합니다.
