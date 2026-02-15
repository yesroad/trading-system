# External API Integration Rules

이 디렉토리의 상세 규칙은 `error-handling-patterns/rules/`에서 관리됩니다.

## 참조 파일

### Error Handling
- [error-classification.md](../../error-handling-patterns/rules/error-classification.md) - 에러 분류 (Transient/Permanent/Recoverable/Fatal)
- [retry-backoff.md](../../error-handling-patterns/rules/retry-backoff.md) - 재시도 및 백오프 전략
- [api-error-handling.md](../../error-handling-patterns/rules/api-error-handling.md) - API 에러 처리
- [cooldown-handling.md](../../error-handling-patterns/rules/cooldown-handling.md) - 쿨다운 처리 (TokenCooldownError)
- [logging-standards.md](../../error-handling-patterns/rules/logging-standards.md) - 구조화된 로깅

### Database
- [db-error-handling.md](../../error-handling-patterns/rules/db-error-handling.md) - Supabase 에러 처리

## API별 특화 가이드

### KIS API
- 토큰 관리: `@workspace/kis-auth` 패키지 사용
- 레이트 리밋: 초당 10회 (보수적)
- 쿨다운: TokenCooldownError 처리 필수

### Upbit API
- 인증: JWT 서명
- 레이트 리밋: Public 10회/초, Private 8회/초
- 캐싱: 마켓 정보 60초

### Yahoo Finance
- 비공식 API: 실패 우아하게 처리
- 타임아웃: 10초
- User-Agent 필수

### OpenAI API
- 스트리밍: 청크 단위 처리
- 타임아웃: 30초 (LLM 호출)
- 비용 추적: 토큰 사용량 로깅

## 사용 방법

external-api-integration 스킬은 error-handling-patterns를 확장합니다:
1. 먼저 error-handling-patterns/rules/를 참조
2. API별 특화 사항은 이 스킬의 SKILL.md 참조
3. 실제 구현 시 두 스킬의 가이드라인을 함께 적용
