# Trading System 규칙

## 개요
트레이딩 데이터 수집, AI 분석, 시각화 대시보드를 위한 Turborepo 모노레포. KIS(한국투자증권)와 Yahoo Finance API에서 시장 데이터를 수집하고, AI로 분석하며, Next.js 대시보드로 표시한다.

## 기술 스택
- Runtime: Node.js >= 22
- Package Manager: Yarn 4.9.2
- Build System: Turborepo
- Language: TypeScript 5.9
- Database: Supabase (PostgreSQL)
- 주요 라이브러리: Next.js 16, React 19, TanStack Query, Zod, Luxon

## 명령어
```bash
dev:         yarn dev           # 모든 워크스페이스 개발 모드 실행
build:       yarn build         # 모든 워크스페이스 빌드
lint:        yarn lint          # 모든 워크스페이스 린트
check-types: yarn check-types   # 모든 워크스페이스 타입 체크
format:      yarn format        # Prettier로 포맷팅
```

## 아키텍처
```
trading-system/
├── apps/
│   └── web/                 # Next.js 대시보드 (App Router)
├── packages/
│   ├── eslint-config/       # 공유 ESLint 설정
│   └── typescript-config/   # 공유 tsconfig
└── services/
    ├── ai-analyzer/         # AI 시장 분석 서비스
    ├── kis-collector/       # KIS API 데이터 수집기
    └── yf-collector/        # Yahoo Finance 수집기
```

데이터 흐름: Services가 시장 데이터 수집 -> Supabase에 저장 -> Web 앱이 API routes로 조회 및 표시.

## 골든 룰

### 불변
- .env 파일 커밋 금지, API 키 노출 금지
- 모든 데이터베이스 작업은 Supabase 클라이언트를 통해
- 서비스는 독립적으로 실행, 데이터베이스로 통신
- 환경 변수는 시작 시 반드시 검증

### 해야 할 것
- 모든 워크스페이스에서 TypeScript strict 모드 사용
- 외부 API 응답은 Zod로 검증
- 모든 날짜/시간 작업에 Luxon 사용
- 커밋 전 `yarn lint`와 `yarn check-types` 실행
- 서비스는 stateless하고 idempotent하게 유지
- 웹 앱에서 서버 상태는 TanStack Query 사용

### 하지 말아야 할 것
- 서비스 간 직접 import (데이터베이스 사용)
- 명시적 정당화 없이 `any` 타입 사용
- 코드나 설정 파일에 시크릿 저장
- API 호출 에러 핸들링 생략
- Date 객체 직접 사용 (Luxon 사용)

## 표준
- 파일: kebab-case, 컴포넌트는 PascalCase
- 함수: camelCase, hooks는 `use` 접두사
- 커밋: Conventional Commits (feat/fix/chore/refactor)
- 브랜치: feature/*, fix/*, chore/*

## 내부 의존성
워크스페이스들이 참조하는 공유 패키지:
- `@workspace/eslint-config`: ESLint 설정
- `@workspace/typescript-config`: TypeScript 설정

## 컨텍스트 라우팅
- **[Web Dashboard](./apps/web/AGENTS.md)** - Next.js 프론트엔드, API routes, React 컴포넌트
- **[ESLint Config](./packages/eslint-config/AGENTS.md)** - web과 node용 린트 규칙
- **[TypeScript Config](./packages/typescript-config/AGENTS.md)** - 공유 tsconfig 베이스
- **[AI Analyzer](./services/ai-analyzer/AGENTS.md)** - AI 시장 분석 로직
- **[KIS Collector](./services/kis-collector/AGENTS.md)** - 한국투자증권 API
- **[YF Collector](./services/yf-collector/AGENTS.md)** - Yahoo Finance 데이터 수집

## 유지보수
이 규칙과 구현 사이의 불일치를 발견하면 표시하라. 패턴이 진화하면 업데이트를 제안하라.
