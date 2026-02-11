# Trading System

> 다중 시장 자동매매 시스템 (국내주식 · 미국주식 · 암호화폐)

**⚠️ 현재 상태:** 개발 중 (실전 투입 전 테스트 및 검증 필요)

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green.svg)](https://nodejs.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-orange.svg)](https://turbo.build/)

---

## 📋 목차

- [개요](#-개요)
- [주요 기능](#-주요-기능)
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

**Trading System**은 국내주식(KRX), 미국주식(US), 암호화폐(Crypto) 시장에서 자동으로 데이터를 수집하고, AI 분석을 통해 매매 신호를 생성하며, 의사결정에 따라 주문을 실행하는 자동매매 시스템입니다.

### 핵심 철학

1. **서비스 격리** - 각 기능을 독립적인 서비스로 분리
2. **DB 중심 통신** - 서비스 간 느슨한 결합
3. **타입 안전** - TypeScript strict mode + 런타임 검증
4. **AI 절제** - 의미 있을 때만 정확하게 호출

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
git clone https://github.com/your-username/trading-system.git
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

### 새 서비스 추가

1. `services/` 에 디렉토리 생성
2. `package.json` 설정
3. TypeScript 설정 (`@workspace/typescript-config` 상속)
4. 환경변수 정의
5. `README.md` 작성
6. 루트 `AGENTS.md` 업데이트

### 테스트 작성 (TODO)

```bash
# 단위 테스트
yarn test

# 특정 패키지 테스트
yarn workspace @workspace/db-client test
```

---

## 🚢 배포 (TODO)

### Docker (권장)

```bash
# Docker 이미지 빌드
docker build -t trading-system/upbit-collector services/upbit-collector

# Docker Compose 실행
docker-compose up -d
```

### PM2

```bash
# PM2로 서비스 실행
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 로그 확인
pm2 logs
```

### 환경 설정

- **Development**: `.env.development`
- **Staging**: `.env.staging`
- **Production**: `.env.production`

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

## ⚠️ 주의사항

### 실전 투입 전 필수 확인

1. ✅ **모든 테스트 통과** (단위/통합/백테스팅)
2. ✅ **리스크 관리 구현** (손절/익절/한도)
3. ✅ **3개월 이상 Paper Trading 성공**
4. ✅ **모니터링 시스템 구축**
5. ✅ **백업 및 복구 계획**

### 현재 상태

**⚠️ 개발 중 - 실전 투입 금지**

- 아키텍처: 완성 ✅
- 테스트: 미완성 ❌
- 리스크 관리: 미완성 ❌
- 운영 인프라: 미완성 ❌

---

## 📄 라이선스

Private - All Rights Reserved

---

## 🙏 Acknowledgments

이 프로젝트는 다음 도구와 기술을 활용하여 개발되었습니다:

- **AI-Assisted Development** - Claude Code 등 과 함께 개발
- **한국투자증권** - 국내/미국주식 API 제공
- **Upbit** - 암호화폐 API 제공
- **Supabase** - 데이터베이스 및 인프라
- **Vercel** - 배포 및 호스팅

---

**⚠️ 면책 조항**

실제 투자에 사용할 경우 발생하는 손실에 대해 개발자는 책임지지 않습니다. 투자는 본인의 판단과 책임 하에 진행하시기 바랍니다.
