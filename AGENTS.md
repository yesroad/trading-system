# Trading System 규칙

## 개요
트레이딩 데이터 수집, AI 분석, 주문 실행, 모니터링 자동화를 위한 Turborepo 모노레포다.
서비스들은 Supabase를 중심으로 느슨하게 결합되며, 공통 로직은 `packages/*`에서 재사용한다.

## 기술 스택
- Runtime: Node.js >= 22
- Package Manager: Yarn 4.9.2
- Build System: Turborepo 2.x
- Language: TypeScript 5.9 (strict)
- Database: Supabase (PostgreSQL)
- 주요 라이브러리: `@supabase/supabase-js`, `luxon`, `zod`, `big.js`, `dotenv`

## 명령어
```bash
dev:         yarn dev
build:       yarn build
lint:        yarn lint
check-types: yarn check-types
format:      yarn format
```

## 아키텍처
```text
trading-system/
├── apps/
│   └── web/                     # 대시보드 (이 문서 라우팅 대상에서 제외)
├── packages/
│   ├── shared-utils/            # env/date/logger/backoff 공통 유틸
│   ├── db-client/               # Supabase 공통 DB 접근 레이어
│   ├── kis-auth/                # KIS 토큰 발급/캐시 관리
│   ├── trading-utils/           # 신호 생성/기술 지표/리스크 계산
│   ├── stock-screener/          # 종목 스크리닝 (CANSLIM 등)
│   ├── eslint-config/           # 공용 ESLint 규칙
│   └── typescript-config/       # 공용 tsconfig
└── services/
    ├── upbit-collector/         # 코인 시세 수집
    ├── kis-collector/           # 국장 시세 수집
    ├── yf-collector/            # 미장 바 수집
    ├── ai-analyzer/             # AI 분석 결과 생성
    ├── trade-executor/          # 매매 의사결정/주문 실행
    ├── monitoring-bot/          # 상태 점검/알림 전송
    ├── backtest-engine/         # 전략 백테스팅
    └── market-calendar/         # 시장 이벤트 관리
```

데이터 흐름: `collectors -> Supabase -> ai-analyzer/trade-executor/monitoring-bot`.
서비스 간 직접 import 대신 DB를 경유한다.

## 골든 룰

### 불변
- 우선순위: `AGENTS.md -> .claude/rules/immutable-rules.md -> .claude/skills/*`.
- `.env`/토큰/키/PII 커밋 금지, 로그 평문 노출 금지.
- 서비스 간 직접 import 금지, 통신은 Supabase 경유.
- 필수 env는 `@workspace/shared-utils`의 `requireEnv`로 검증.
- 수치/금융 계산은 `big.js` 사용 (`count/index/time(ms)`는 `number` 허용).
- 날짜/시간은 Luxon 또는 `@workspace/shared-utils` 유틸 사용 (`Date` 직접 사용 금지).

### 해야 할 것
- 공통 동작은 `@workspace/db-client`, `@workspace/shared-utils`, `@workspace/kis-auth` 우선 사용.
- 외부 API 응답은 런타임 검증(Zod) 적용.
- 모든 워크스페이스에서 `check-types`/`lint` 통과 유지.
- 규칙-구현 괴리 발견 시 AGENTS/룰 업데이트 제안.

### 하지 말아야 할 것
- 명시적 근거 없는 `any` 사용.
- 서비스 내부에서 토큰 발급/공통 유틸 재구현.
- 에러 처리 없는 DB/API 호출.
- 실거래 관련 설정 변경 시 검증 없이 즉시 적용.

## 표준
- 파일: kebab-case
- 타입/클래스: PascalCase
- 함수/변수: camelCase
- 커밋: Conventional Commits (`feat|fix|chore|refactor|docs|test`)
- 브랜치: `feature/*`, `fix/*`, `chore/*`

## 내부 의존성
- `@workspace/shared-utils`: env/date/logger/backoff/Nullable
- `@workspace/db-client`: 공통 Supabase 접근 함수
- `@workspace/kis-auth`: KIS TokenManager 및 오류 타입
- `@workspace/trading-utils`: 신호 생성/기술 지표/리스크 계산
- `@workspace/stock-screener`: 종목 스크리닝 엔진
- `@workspace/eslint-config`: 공용 lint 규칙
- `@workspace/typescript-config`: 공용 tsconfig preset

## 컨텍스트 라우팅
- **[Immutable Rules](./.claude/rules/immutable-rules.md)** - 보안/아키텍처/타입 불변 규칙
- **[Common Packages Skill](./.claude/skills/common-packages/SKILL.md)** - 공통 패키지 사용 패턴
- **[Coding Standards Skill](./.claude/skills/coding-standards/SKILL.md)** - TS 코딩 규칙 체크리스트
- **[Database Operations Skill](./.claude/skills/database-operations/SKILL.md)** - DB 조회/검증/운영 패턴
- **[Project Context Skill](./.claude/skills/project-context/SKILL.md)** - 모노레포 구조/역할 요약
- **[Upbit Collector](./services/upbit-collector/README.md)** - 코인 데이터 수집 작업
- **[KIS Collector](./services/kis-collector/AGENTS.md)** - 국내 시세 수집/KIS 작업
- **[YF Collector](./services/yf-collector/AGENTS.md)** - 미국 시세 수집/Yahoo 작업
- **[AI Analyzer](./services/ai-analyzer/README.md)** - AI 분석 파이프라인 작업
- **[Trade Executor](./services/trade-executor/trading-rules.md)** - 매매 룰/주문 실행 작업
- **[Monitoring Bot](./services/monitoring-bot/README.md)** - 알림/운영 모니터링 작업
- **[Backtest Engine](./services/backtest-engine/README.md)** - 전략 백테스팅 작업
- **[Market Calendar](./services/market-calendar/README.md)** - 시장 이벤트 관리 작업
- **[DB Client](./packages/db-client/package.json)** - 공통 DB 레이어 변경 작업
- **[Shared Utils](./packages/shared-utils/package.json)** - 공통 유틸 변경 작업
- **[KIS Auth](./packages/kis-auth/README.md)** - KIS 인증 토큰 작업
- **[Trading Utils](./packages/trading-utils/README.md)** - 신호/지표/리스크 계산 작업
- **[Stock Screener](./packages/stock-screener/README.md)** - 종목 스크리닝 작업
- **[ESLint Config](./packages/eslint-config/AGENTS.md)** - lint 규칙 조정
- **[TypeScript Config](./packages/typescript-config/AGENTS.md)** - tsconfig 조정

## 유지보수
규칙이 코드와 다르면 즉시 차이를 기록하고, 수정 우선순위를 제안하라.
새 워크스페이스가 추가되면 루트 라우팅 섹션에 경로를 등록하라.

## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
