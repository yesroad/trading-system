# Trading System - 문서 인덱스

이 파일은 trading-system 모노레포의 모든 문서를 정리한 인덱스입니다.

## 루트 문서

### [AGENTS.md](../AGENTS.md)
- **목적**: AI 에이전트를 위한 최상위 가이드라인
- **내용**: 시스템 개요, 워크스페이스 구조, 필수 규칙, 작업 가이드라인
- **대상**: Claude Code 또는 다른 AI 에이전트

### [README.md](../README.md)
- **목적**: 프로젝트 소개 및 시작 가이드
- **내용**: 프로젝트 개요, 설치 방법, 주요 명령어
- **대상**: 개발자 (사람)

## .claude/ 규칙 문서

### [immutable-rules.md](./.rules/immutable-rules.md)
- **목적**: 절대 변경하면 안 되는 핵심 규칙
- **내용**: 보안, 아키텍처, 타입/검증, 환경변수, 숫자/날짜, DB 접근
- **우선순위**: 최상위 (AGENTS.md 다음)

### [architecture-guide.md](./.rules/architecture-guide.md)
- **목적**: 시스템 아키텍처 상세 설명
- **내용**:
  - 전체 시스템 아키텍처
  - 서비스별 아키텍처 (Collectors, AI Analyzer, Trade Executor, Monitoring Bot)
  - 공유 라이브러리 아키텍처
  - 데이터 모델 및 흐름
  - 에러 처리 전략
  - 성능 최적화
  - 보안 고려사항
  - 배포 및 운영
- **대상**: 아키텍처 설계, 서비스 간 통신 이해 필요 시

### [database-guide.md](./.rules/database-guide.md)
- **목적**: Supabase 데이터베이스 스키마 및 접근 패턴
- **내용**:
  - 데이터베이스 개요 및 연결 방법
  - 테이블 스키마 (positions, account_cash, *_candles, ai_analysis, trades, system_guard, worker_status, ingestion_runs, notification_events)
  - 공통 쿼리 패턴 (에러 처리, upsert, 페이징, 집계, 트랜잭션)
  - 인덱스 전략
  - 마이그레이션 전략
  - 성능 최적화
  - 보안 (RLS)
- **대상**: DB 쿼리 작성, 스키마 변경 필요 시

## .claude/ 스킬 문서

### [coding-standards/SKILL.md](./skills/coding-standards/SKILL.md)
- **목적**: TypeScript 코딩 표준
- **내용**: strict mode 규칙, 네이밍, 에러 처리, 날짜/숫자 규칙
- **사용**: `/coding-standards` 스킬 호출

### [error-handling-patterns/SKILL.md](./skills/error-handling-patterns/SKILL.md)
- **목적**: 에러 처리 패턴
- **내용**: 에러 분류, 재시도 + 백오프, TokenCooldownError 처리, 로깅 표준
- **사용**: `/error-handling-patterns` 스킬 호출 (외부 API, DB 쿼리, 네트워크 작업 시)

### [external-api-integration/SKILL.md](./skills/external-api-integration/SKILL.md)
- **목적**: 외부 API 통합 패턴
- **내용**: Zod 검증, KIS/Upbit/Yahoo API 인증, 레이트 리밋, 캐싱, 배치 처리
- **사용**: `/external-api-integration` 스킬 호출 (외부 API 통합 시)

### [common-packages/SKILL.md](./skills/common-packages/SKILL.md)
- **목적**: 공통 패키지 사용 패턴
- **내용**: @workspace/shared-utils, @workspace/db-client, @workspace/kis-auth 사용법
- **사용**: `/common-packages` 스킬 호출

### [database-operations/SKILL.md](./skills/database-operations/SKILL.md)
- **목적**: DB 작업 패턴
- **내용**: Supabase 스키마 확인, 쿼리 작성/검증, db-client 우선 적용
- **사용**: `/database-operations` 스킬 호출

### [project-context/SKILL.md](./skills/project-context/SKILL.md)
- **목적**: 모노레포 구조 및 컴포넌트 책임
- **내용**: 워크스페이스 구조, 각 패키지/서비스 역할
- **사용**: `/project-context` 스킬 호출

### [dashboard-ui-skill/SKILL.md](./skills/dashboard-ui-skill/SKILL.md)
- **목적**: Trading Dashboard 데이터 흐름 및 상태 아키텍처
- **내용**: Next.js App Router, React Query, Jotai 사용 패턴
- **사용**: `/dashboard-ui-skill` 스킬 호출 (apps/web 작업 시)

### [composition-patterns/](./skills/composition-patterns/)
- **목적**: React composition 패턴
- **내용**: compound components, render props, context providers
- **사용**: `/composition-patterns` 스킬 호출 (React 컴포넌트 작업 시)

### [react-best-practices/](./skills/react-best-practices/)
- **목적**: React/Next.js 성능 최적화
- **내용**: Vercel Engineering 가이드라인
- **사용**: `/react-best-practices` 스킬 호출 (React/Next.js 작업 시)

### [web-design-guidelines/SKILL.md](./skills/web-design-guidelines/SKILL.md)
- **목적**: UI 코드 리뷰 가이드
- **내용**: 접근성, UX, 디자인 베스트 프랙티스
- **사용**: `/web-design-guidelines` 스킬 호출 (UI 리뷰 시)

## 패키지 문서

### [packages/shared-utils/README.md](../packages/shared-utils/README.md)
- **목적**: 공통 유틸리티 라이브러리 문서
- **내용**: 환경변수, 날짜/시간, 로깅, 백오프, 공용 타입
- **대상**: shared-utils 사용 또는 수정 시

### [packages/db-client/README.md](../packages/db-client/README.md)
- **목적**: Supabase 접근 레이어 문서
- **내용**: 클라이언트, 포지션, 워커 상태, 계좌 현금, 수집 배치 추적
- **대상**: db-client 사용 또는 수정 시

### [packages/kis-auth/README.md](../packages/kis-auth/README.md)
- **목적**: KIS API 토큰 관리 문서
- **내용**: TokenManager, 쿨다운 메커니즘, 에러 처리
- **대상**: kis-auth 사용 또는 수정 시

### packages/eslint-config/
- **목적**: 공용 ESLint 규칙
- **내용**: 설정 파일만 (문서 없음)

### packages/typescript-config/
- **목적**: 공용 TypeScript 설정
- **내용**: 설정 파일만 (문서 없음)

## 서비스 문서

### [services/upbit-collector/README.md](../services/upbit-collector/README.md)
- **목적**: 업비트 암호화폐 시세 수집 서비스
- **내용**: 아키텍처, 주요 함수, 실행 방법
- **대상**: upbit-collector 작업 시

### [services/kis-collector/README.md](../services/kis-collector/README.md)
- **목적**: KIS 국내주식 시세 수집 서비스
- **내용**: 아키텍처, 장시간 체크, 실행 방법
- **대상**: kis-collector 작업 시

### [services/yf-collector/README.md](../services/yf-collector/README.md)
- **목적**: Yahoo Finance 미국주식 시세 수집 서비스
- **내용**: 아키텍처, Yahoo API 사용, 실행 방법
- **대상**: yf-collector 작업 시

### [services/ai-analyzer/README.md](../services/ai-analyzer/README.md)
- **목적**: AI 분석 및 신호 생성 서비스
- **내용**: AI 호출 절제 원칙, 마켓 모드, 실행 방법
- **대상**: ai-analyzer 작업 시

### [services/trade-executor/README.md](../services/trade-executor/README.md)
- **목적**: 매매 의사결정 및 주문 실행 서비스
- **내용**: 가드 체크, 매매 규칙, 주문 실행
- **대상**: trade-executor 작업 시

### [services/monitoring-bot/README.md](../services/monitoring-bot/README.md)
- **목적**: 시스템 모니터링 및 알림 서비스
- **내용**: 워커 상태 확인, 알림 발송
- **대상**: monitoring-bot 작업 시

## 앱 문서

### apps/web/
- **목적**: Next.js 대시보드
- **내용**: AGENTS.md 또는 README.md 존재 가능
- **대상**: 웹 대시보드 작업 시

## 문서 우선순위 (참조 순서)

작업 시 다음 순서로 문서를 참조하세요:

1. **루트 AGENTS.md** - 전체 시스템 개요 및 규칙
2. **.claude/rules/immutable-rules.md** - 불변 규칙
3. **해당 워크스페이스 문서** - 작업 대상 패키지/서비스
4. **.claude/rules/architecture-guide.md** - 아키텍처 이해 필요 시
5. **.claude/rules/database-guide.md** - DB 작업 필요 시
6. **.claude/skills/** - 특정 작업 패턴 필요 시

## 문서 관리

### 새 워크스페이스 추가 시

1. 워크스페이스 디렉토리에 README.md 작성
2. 루트 AGENTS.md의 "컨텍스트 라우팅" 섹션에 링크 추가
3. 이 문서의 해당 섹션에 추가

### 기존 문서 수정 시

1. 해당 문서 직접 수정
2. 관련 문서에 영향 있으면 함께 업데이트
3. 변경 사항 커밋 메시지에 명시

### 문서 검색

```bash
# 전체 문서에서 키워드 검색
grep -r "keyword" --include="*.md" .

# .claude/ 디렉토리만 검색
grep -r "keyword" --include="*.md" .claude/

# 특정 패키지/서비스 문서만 검색
grep -r "keyword" --include="*.md" packages/
grep -r "keyword" --include="*.md" services/
```

---

**마지막 업데이트:** 2026-02-11
**버전:** 1.0
