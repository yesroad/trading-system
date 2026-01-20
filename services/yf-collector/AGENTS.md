# YF Collector 규칙

## 목적
Yahoo Finance API에서 시장 데이터를 수집하는 서비스. 해외 주식 및 지수 데이터 수집, 수집 상태 관리 담당.

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
- luxon: 3.7 - 날짜/시간 처리
- zod: 4.3 - 런타임 검증

### 개발
- tsx: 4.21 - TypeScript 실행
- typescript: 5.9 - 타입 체크
- eslint: 9.39 - 린터

## 구조
```
src/
├── index.ts       # 진입점, 메인 루프
├── fetchYahoo.ts  # Yahoo Finance API 클라이언트
├── db.ts          # 데이터베이스 쿼리
├── status.ts      # 수집 상태 관리
├── supabase.ts    # Supabase 클라이언트
└── utils/
    └── env.ts     # 환경 변수 검증
```

## 로컬 규칙

### 해야 할 것
- Yahoo Finance 응답을 Zod로 검증
- 모든 날짜/시간에 Luxon 사용
- 환경 변수 시작 시 검증 (utils/env.ts)
- 수집 상태 주기적 업데이트 (status.ts)
- API 응답 실패 시 적절한 재시도

### 하지 말아야 할 것
- Date 객체 직접 사용
- API 응답 검증 생략
- 하드코딩된 심볼 목록
- 무한 재시도

## Zod 검증 패턴
```ts
// fetchYahoo.ts
const QuoteSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  timestamp: z.number(),
});

export async function fetchQuote(symbol: string) {
  const response = await fetch(url);
  const data = await response.json();
  return QuoteSchema.parse(data); // 검증 실패 시 에러
}
```

## 데이터 흐름
```
1. 수집 대상 심볼 목록 로드
2. Yahoo Finance API 호출
3. Zod로 응답 검증
4. Luxon으로 타임스탬프 처리
5. Supabase에 데이터 저장
6. status 업데이트
```

## 참고
공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.
