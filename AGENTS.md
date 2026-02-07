# Trading System 규칙

## 개요
트레이딩 데이터 수집, AI 분석, 모니터링, 시각화 대시보드를 위한 Turborepo 모노레포. Upbit, KIS(한국투자증권), Yahoo Finance API에서 시장 데이터를 수집하고, AI로 분석하며, 모니터링 봇과 Next.js 대시보드로 운영 상태를 확인한다.

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
│   ├── shared-utils/        # 공통 유틸리티
│   ├── db-client/           # Supabase DB 레이어
│   ├── kis-auth/            # KIS 인증
│   ├── eslint-config/       # 공유 ESLint 설정
│   └── typescript-config/   # 공유 tsconfig
└── services/
    ├── upbit-collector/     # Upbit 데이터 수집기
    ├── ai-analyzer/         # AI 시장 분석 서비스
    ├── kis-collector/       # KIS API 데이터 수집기
    ├── yf-collector/        # Yahoo Finance 수집기
    └── monitoring-bot/      # 모니터링/알림 봇
```

데이터 흐름: Collectors가 시장 데이터 수집 -> Supabase에 저장 -> AI Analyzer/Monitoring Bot/Web 앱이 조회 및 활용.

## 골든 룰

### 작업 기준
- 작업 시 `.claude/skills`와 `.claude/rules`의 최신 내용을 먼저 확인하고, 해당 규칙/가이드를 우선 적용한다.
- 충돌 시 우선순위: `AGENTS.md` -> `.claude/rules/immutable-rules.md` -> `.claude/skills/*`
### 상세 불변 규칙
- 보안/아키텍처/타입/환경변수/숫자 계산의 상세 불변 규칙은 `.claude/rules/immutable-rules.md`를 단일 출처로 따른다.

## 표준
- 파일: kebab-case, 컴포넌트는 PascalCase
- 함수: camelCase, hooks는 `use` 접두사
- 커밋: Conventional Commits (feat/fix/chore/refactor)
- 브랜치: feature/*, fix/*, chore/*

## 내부 의존성
워크스페이스들이 참조하는 공유 패키지:
- `@workspace/shared-utils`: 공통 유틸리티
- `@workspace/db-client`: Supabase 접근 레이어
- `@workspace/kis-auth`: KIS 인증 처리
- `@workspace/eslint-config`: ESLint 설정
- `@workspace/typescript-config`: TypeScript 설정

## 컨텍스트 라우팅
- **[Web Dashboard](./apps/web/AGENTS.md)** - Next.js 프론트엔드, API routes, React 컴포넌트
- **[Shared Utils](./packages/shared-utils/package.json)** - 공통 유틸리티 패키지 정보
- **[DB Client](./packages/db-client/package.json)** - Supabase DB 접근 레이어 패키지 정보
- **[KIS Auth](./packages/kis-auth/README.md)** - 한국투자증권 인증 패키지
- **[ESLint Config](./packages/eslint-config/AGENTS.md)** - web과 node용 린트 규칙
- **[TypeScript Config](./packages/typescript-config/AGENTS.md)** - 공유 tsconfig 베이스
- **[Upbit Collector](./services/upbit-collector/README.md)** - Upbit 데이터 수집기
- **[AI Analyzer](./services/ai-analyzer/README.md)** - AI 시장 분석 서비스
- **[KIS Collector](./services/kis-collector/AGENTS.md)** - 한국투자증권 API
- **[YF Collector](./services/yf-collector/AGENTS.md)** - Yahoo Finance 데이터 수집
- **[Monitoring Bot](./services/monitoring-bot/README.md)** - 모니터링/알림 봇

## 유지보수
이 규칙과 구현 사이의 불일치를 발견하면 표시하라. 패턴이 진화하면 업데이트를 제안하라.
