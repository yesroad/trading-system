# AI Analyzer 규칙

## 목적
수집된 시장 데이터를 AI로 분석하여 트레이딩 인사이트를 생성하는 서비스. 후보 종목 선정, 기술적 분석 요약, OHLC 데이터 처리 담당.

## 관계
- 의존: @workspace/eslint-config, @workspace/typescript-config
- 사용처: apps/web (분석 결과 조회)

## 명령어
```bash
dev:   yarn dev    # tsx로 개발 모드 실행
build: yarn build  # TypeScript 컴파일
```

## 의존성

### 외부 (주요)
- @supabase/supabase-js: 2.57 - 데이터베이스 클라이언트
- dotenv: 17.2 - 환경 변수 로드
- luxon: 3.6 - 날짜/시간 처리

### 개발
- tsx: 4.20 - TypeScript 실행
- typescript: 5.9 - 타입 체크

## 구조
```
src/
├── index.ts        # 진입점
├── ai.ts           # AI 분석 로직
├── candidates.ts   # 후보 종목 선정
├── db.ts           # 데이터베이스 쿼리
├── supabase.ts     # Supabase 클라이언트
├── types/
│   └── ai.ts       # AI 관련 타입 정의
└── utils/
    ├── env.ts      # 환경 변수 검증
    ├── hash.ts     # 해시 유틸리티
    ├── ohlc.ts     # OHLC 데이터 처리
    └── summary.ts  # 요약 생성
```

## 로컬 규칙

### 해야 할 것
- 모든 날짜/시간에 Luxon 사용
- AI 응답 구조 타입 정의 유지
- 환경 변수 시작 시 검증 (utils/env.ts)
- 데이터베이스 쿼리는 db.ts에 집중
- OHLC 계산 로직은 utils/ohlc.ts에

### 하지 말아야 할 것
- Date 객체 직접 사용
- 하드코딩된 설정값
- 다른 서비스 직접 import
- AI 응답 검증 생략

## 데이터 흐름
```
1. Supabase에서 시장 데이터 조회
2. 후보 종목 필터링 (candidates.ts)
3. OHLC 데이터 처리 (utils/ohlc.ts)
4. AI 분석 수행 (ai.ts)
5. 결과를 Supabase에 저장
```

## 참고
공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.
