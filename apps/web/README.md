# Web Dashboard

Next.js(App Router) 기반 트레이딩 모니터 대시보드입니다.

## 실행

```bash
yarn dev
yarn build
yarn lint
```

## 인증 구조

- 로그인: `/login` (Google OAuth)
- 콜백: `/auth/callback`
- 보호 페이지: `/dashboard/*`
- 보호 API: `/api/snapshot`, `/api/trade-history`, `/api/trading-signals`, `/api/risk-events`
- 허용 이메일 화이트리스트: `ALLOWED_EMAILS`

## 필수 환경변수

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
ALLOWED_EMAILS=me@gmail.com,other@gmail.com

# 기존 대시보드 데이터 조회용 서버 키
SUPABASE_URL=
SUPABASE_KEY=
```

## Supabase 설정

1. Supabase Dashboard > Authentication > Providers > Google 활성화
2. Redirect URL 등록
3. 로컬: `http://localhost:3000/auth/callback`
4. 프로덕션: `https://<your-domain>/auth/callback`

## Vercel 배포 주의사항

- `NEXT_PUBLIC_APP_URL`은 배포 도메인과 정확히 일치해야 합니다.
- Preview/Production 환경별로 Redirect URL과 env를 분리 관리하세요.
- 서비스 롤 키(`SUPABASE_KEY`)는 브라우저 노출 금지입니다.
