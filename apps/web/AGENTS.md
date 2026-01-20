# Web Dashboard 규칙

## 목적
트레이딩 데이터, 시장 분석, 시스템 상태를 시각화하는 Next.js 16 App Router 대시보드. 수집된 시장 데이터와 AI 분석 결과를 모니터링하는 주요 인터페이스 역할.

## 관계
- 의존: @workspace/eslint-config, @workspace/typescript-config
- 사용처: Supabase (데이터베이스), services/* (DB를 통한 데이터 소스)

## 명령어
```bash
dev:   yarn dev    # Next.js 개발 서버 시작 (port 3000)
build: yarn build  # 프로덕션 빌드
start: yarn start  # 프로덕션 서버 실행
lint:  yarn lint   # ESLint 실행
```

## 의존성

### 외부 (주요)
- next: 16.1.1 - React 19 지원 App Router
- react: 19.2.3 - UI 라이브러리
- @tanstack/react-query: 5.90 - 서버 상태 관리
- @supabase/supabase-js: 2.90 - 데이터베이스 클라이언트
- @radix-ui/*: UI primitives (shadcn/ui 컴포넌트)
- tailwindcss: 4 - 스타일링
- lucide-react: 아이콘
- axios: HTTP 클라이언트
- zod: 런타임 검증

## 구조
```
src/
├── app/
│   ├── api/              # API routes (Route Handlers)
│   │   └── ops/snapshot/ # Operations snapshot 엔드포인트
│   ├── dashboard/        # 대시보드 페이지
│   ├── layout.tsx        # 루트 레이아웃
│   └── page.tsx          # 홈 페이지
├── components/
│   └── ui/               # shadcn/ui 컴포넌트
├── lib/
│   ├── env.server.ts     # 서버 사이드 env 검증
│   └── utils.ts          # 유틸리티 함수 (cn)
├── provider/
│   └── queryProvider.tsx # TanStack Query provider
├── queries/
│   └── useOpsSnapshot.ts # 데이터 페칭 hooks
├── services/
│   └── api/              # API 클라이언트 서비스
│       ├── http.ts       # Axios 인스턴스
│       └── ops.snapshot.ts
└── types/
    └── ops.ts            # 타입 정의
```

## 로컬 규칙

### 해야 할 것
- 기본으로 Server Components 사용
- mutations에 Server Actions 사용
- API routes나 Server Components에서만 Supabase 접근
- 클라이언트 사이드 데이터 페칭에 TanStack Query 사용
- 서버 사이드에서 env.server.ts로 환경 변수 검증
- 조건부 클래스 병합에 `cn()` 유틸리티 사용
- API routes는 얇게 유지, services로 위임

### 하지 말아야 할 것
- 정당화 없이 `'use client'` 추가
- useEffect에서 데이터 페칭 (TanStack Query 사용)
- 클라이언트 컴포넌트에서 직접 데이터베이스 접근
- 클라이언트 컴포넌트에 server-only 코드 import
- 데이터 의존 UI에서 loading/error 상태 생략

## 컴포넌트 패턴
```tsx
// Server Component (기본)
export default async function Page() {
  const data = await fetchData();
  return <Component data={data} />;
}

// Client Component with Query
'use client';
export function ClientComponent() {
  const { data, isLoading } = useOpsSnapshot();
  if (isLoading) return <Skeleton />;
  return <div>{data}</div>;
}
```

## API Route 패턴
```ts
// app/api/[endpoint]/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const data = await service.getData();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
```

## 스타일링
- Tailwind CSS 4 with tw-animate-css
- src/components/ui/에 shadcn/ui 컴포넌트
- 컴포넌트 variants에 CVA (class-variance-authority) 사용
- eslint-plugin-tailwindcss로 Tailwind 클래스 순서 강제

## 참고
공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.
