---
name: dashboard-ui
description: Trading Dashboard 데이터 흐름 및 상태 아키텍처. Next.js App Router + React Query + Jotai.
metadata:
  author: yesroad
  version: 1.1.0
  category: frontend
---

# Dashboard UI (Lean)

대시보드 특화 가이드. UI 디자인은 `web-design-guidelines`, 컴포넌트 분해는 `composition-patterns`, React 원칙은 `react-best-practices` 참조.

## 데이터 아키텍처

### 서버 상태 (React Query)
- Supabase fetch
- 캐시 + polling 관리
- queryKey: 도메인 기반 명확히

### 클라이언트 상태 (Jotai)
- 필터/정렬/UI 토글/선택만
- 비즈니스 데이터 저장 금지

**규칙: 서버 상태와 클라이언트 상태 혼합 금지**

## 디렉토리 책임

```
app/        → 라우팅
components/ → UI (composition-patterns)
hooks/      → React Query
store/      → Jotai atoms
lib/        → Supabase, formatters
types/      → 도메인 타입
```

## Quick Checklist

- [ ] 서버 데이터: `useQuery` 사용
- [ ] 클라이언트 상태: Jotai atom
- [ ] queryKey: `['domain', param]` 명확히
- [ ] 폴링: 5-10초 (기본값)
- [ ] 에러: throw 필수
- [ ] 금융 계산: `big.js`
- [ ] 100개+ 리스트: virtual scroll
- [ ] 이미지: `next/image`

## React Query 패턴

```typescript
useQuery({
  queryKey: ['positions', market],
  queryFn: fetchPositions,
  refetchInterval: 5000,
});
```

## Jotai 패턴

```typescript
// atoms.ts
export const filterAtom = atom<Filter>({ ... });
export const sortAtom = atom<Sort>('date');
```

**Atom은 UI 상태만. 비즈니스 데이터는 React Query.**

## 실시간 전략

1. React Query Polling (기본)
2. Supabase Realtime (고빈도 시)
   - Realtime 사용 시 `queryClient.invalidateQueries`

## 성능 기준

- 100개+ 리스트 → virtual scroll
- 계산 많은 곳 → `useMemo`
- 이미지 → `next/image`

## 에러/로딩 처리

- `error.tsx` 사용
- `loading.tsx` 사용
- React Query 에러는 UI 노출

## 책임 경계

이 스킬이 담당하지 않는 영역:
- 컴포넌트 분해 → `composition-patterns`
- React 설계 원칙 → `react-best-practices`
- 디자인 규칙 → `web-design-guidelines`
- TypeScript 규칙 → `coding-standards`
