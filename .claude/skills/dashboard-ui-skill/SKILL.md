---
description: Trading Dashboard 데이터 흐름 및 상태 아키텍처 가이드.
  Next.js App Router + React Query + Jotai 기반.
name: dashboard-ui
---

# Dashboard UI Skill

## 목적

이 스킬은 대시보드의 데이터 흐름과 상태 설계를 정의한다. UI 세부
디자인은 web-design-guidelines, 컴포넌트 분해는 composition-patterns,
React 일반 원칙은 react-best-practices를 따른다.

---

# 1. 데이터 아키텍처 원칙

- 기본 공통 구조가 있다면 그 구조는 존중하면서 작업한다

## 서버 상태

- React Query 사용
- Supabase fetch
- 캐시 + polling 관리

## 클라이언트 상태

- Jotai 사용
- 필터 / UI 토글 / 선택 상태 전용

서버 상태와 클라이언트 상태를 혼합하지 않는다.

---

# 2. 디렉토리 책임 구조

app/ → 라우팅 components/ → UI (composition-patterns 따름) hooks/ →
데이터 훅 (React Query) store/ → Jotai atom lib/ → Supabase, formatters
types/ → 도메인 타입

---

# 3. React Query 규칙

- 모든 서버 데이터는 useQuery 사용
- queryKey는 도메인 기반 명확하게 구성
- 기본 polling 5\~10초
- error는 반드시 throw

예:

```ts
useQuery({
  queryKey: ['positions', market],
  queryFn: fetchPositions,
  refetchInterval: 5000,
});
```

---

# 4. Jotai 상태 설계

Atom은 다음만 담당:

- 필터
- 정렬 기준
- UI 열림/닫힘
- 선택 상태

비즈니스 데이터 저장 금지.

---

# 5. 금융 계산 규칙

수익률, 금액, 비율 계산은 반드시 big.js 사용. 표시 직전에만 number로
변환.

---

# 6. 실시간 전략

1.  React Query Polling (기본)
2.  Supabase Realtime (고빈도 필요 시)

Realtime 사용 시 queryClient.invalidateQueries 사용.

---

# 7. 성능 기준

- 100개 이상 리스트 → virtual scroll
- 계산 많은 곳 → useMemo
- 이미지 → next/image 사용

---

# 8. 에러 처리

- error.tsx 사용
- loading.tsx 사용
- React Query 에러는 UI에 노출

---

# 9. 책임 분리

이 스킬이 담당하지 않는 영역:

- 컴포넌트 분해 → composition-patterns
- React 설계 원칙 → react-best-practices
- 디자인 규칙 → web-design-guidelines
- TypeScript 규칙 → coding-standards
