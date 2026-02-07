# KIS Collector 규칙

## 목적
한국투자증권(KIS) API에서 실시간 시장 데이터를 수집하는 서비스. 추적 종목의 틱 데이터 수집, 시스템 가드 상태 관리, 워커 상태 모니터링 담당.

## 관계
- 의존: @workspace/eslint-config, @workspace/typescript-config
- 사용처: apps/web (수집 데이터 조회), services/ai-analyzer (분석 대상 데이터)

## 명령어
```bash
dev:         yarn dev         # tsx로 개발 모드 실행
build:       yarn build       # TypeScript 컴파일
lint:        yarn lint        # ESLint 실행
check-types: yarn check-types # 타입 체크
```

## 의존성

### 외부 (주요)
- @supabase/supabase-js: 2.90 - 데이터베이스 클라이언트
- dotenv: 17.2 - 환경 변수 로드

### 개발
- tsx: 4.21 - TypeScript 실행
- typescript: 5.9 - 타입 체크
- eslint: 9.39 - 린터

## 구조
```
src/
├── index.ts          # 진입점, 메인 루프
├── kis.ts            # KIS API 클라이언트
├── insertTick.ts     # 틱 데이터 삽입
├── trackedSymbols.ts # 추적 종목 관리
├── systemGuard.ts    # 시스템 가드 상태
├── workerStatus.ts   # 워커 상태 관리
├── backoff.ts        # 재시도 로직
├── supabase.ts       # Supabase 클라이언트
└── utils/
    └── env.ts        # 환경 변수 검증
```

## 로컬 규칙

### 해야 할 것
- KIS API 호출 실패 시 backoff 재시도
- 환경 변수 시작 시 검증 (utils/env.ts)
- 틱 데이터 배치 삽입으로 성능 최적화
- 워커 상태 주기적 업데이트
- 시스템 가드로 이상 상태 감지

### 하지 말아야 할 것
- API 키 하드코딩
- 무한 재시도 (backoff 사용)
- 단일 틱 개별 삽입 (배치 사용)
- 에러 무시하고 진행

## KIS API 패턴
```ts
// kis.ts
export async function fetchQuote(symbol: string) {
  // API 호출 with proper headers
  // 응답 검증
  // 에러 시 backoff 적용
}
```

## 데이터 흐름
```
1. trackedSymbols에서 추적 대상 로드
2. KIS API로 실시간 데이터 요청
3. 틱 데이터 Supabase에 배치 삽입
4. workerStatus 업데이트
5. systemGuard로 이상 감지 시 알림
```

## 참고
- KIS API 문서: 한국투자증권 OpenAPI 참조
- 공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.

## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
