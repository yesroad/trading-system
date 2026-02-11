---
name: external-api-integration
description: 외부 API 통합 체크리스트. Zod, 인증, 레이트 리밋, 타임아웃, 캐싱.
metadata:
  author: yesroad
  version: 2.0.0
  category: integration
---

# External API Integration (Lean)

상세 가이드는 `.claude/rules/`와 `error-handling-patterns` 참조.
이 스킬은 **통합 시 체크리스트**만 제공.

## Quick Checklist

- [ ] Zod 스키마로 응답 검증 (`safeParse`)
- [ ] 타임아웃 설정 (기본 5초)
- [ ] 레이트 리밋 준수
- [ ] 인증 토큰/서명 올바르게 생성
- [ ] 4xx는 재시도 안 함, 5xx는 재시도
- [ ] 에러 응답 구조화 로깅
- [ ] API 키는 환경변수 (`requireEnv`)
- [ ] API 키 로그 평문 노출 금지

## API-Specific Patterns

### KIS (한국투자증권)
- 토큰: `@workspace/kis-auth` 사용
- TokenCooldownError: 스킵 또는 대기
- 레이트 리밋: 초당 20회 (보수적으로 10회)

### Upbit (업비트)
- 인증: JWT 서명 (쿼리 해싱)
- 레이트 리밋: 초당 10회 (Public), 8회 (Private)
- 캐싱: 마켓 정보 60초

### Yahoo Finance
- 비공식 API: 실패 우아하게 처리
- User-Agent 필수
- 타임아웃: 10초 (느림)

### OpenAI
- 스트리밍: 청크 단위 처리
- 토큰 제한: 입력 체크
- 비용 추적: 사용량 로깅

## Validation Pattern

```typescript
import { z } from 'zod';

const Schema = z.object({ ... });
const result = Schema.safeParse(response);
if (!result.success) {
  logger.error('검증 실패', { error: result.error });
  return null;
}
return result.data;  // 타입 안전
```

## Timeout Pattern

```typescript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);
const response = await fetch(url, { signal: controller.signal });
```

## Rate Limit Pattern

```typescript
class RateLimiter {
  async waitIfNeeded() { ... }
}
const limiter = new RateLimiter(10, 100);
await limiter.waitIfNeeded();
```

## Related Skills

- [Error Handling](../error-handling-patterns/SKILL.md) - 에러 처리 패턴
- [Coding Standards](../coding-standards/SKILL.md) - TypeScript 규칙
