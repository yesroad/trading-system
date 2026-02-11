---
name: error-handling-patterns
description: 에러 처리 체크리스트. 4분류, 재시도, 쿨다운, 로깅. 상세는 rules/ 참조.
metadata:
  author: yesroad
  version: 2.0.0
  category: reliability
---

# Error Handling (Lean)

상세 패턴은 `./rules/` 파일 참조. 이 스킬은 **즉시 적용 체크리스트**만 제공.

## 4-Category Classification

| 카테고리 | 처리 | 예시 |
|---------|------|------|
| **Transient** | 재시도 + 백오프 | 타임아웃, 503 |
| **Permanent** | 로깅 + throw | 401, 404 |
| **Recoverable** | 로깅 + 기본값 | 선택적 데이터 없음 |
| **Fatal** | 로깅 + 종료 | DB 연결 실패 |

## Quick Checklist

- [ ] API 에러: 4xx/5xx 구분
- [ ] DB 에러: `error` 필드 체크 필수
- [ ] 재시도: `createBackoff` 사용
- [ ] TokenCooldownError: 스킵 또는 대기
- [ ] 로깅: 구조화 (url, status, context)

## When to Use

- 네트워크 타임아웃 → Transient → `createBackoff` 재시도
- 401/403 → Permanent → 즉시 throw
- 선택적 데이터 없음 → Recoverable → null 반환
- DB 연결 실패 → Fatal → process.exit(1)

## Pattern References

상세 구현은 rules 폴더:
- [에러 분류](./rules/error-classification.md)
- [재시도 + 백오프](./rules/retry-backoff.md)
- [쿨다운 처리](./rules/cooldown-handling.md)
- [로깅 표준](./rules/logging-standards.md)
- [API 에러](./rules/api-error-handling.md)
- [DB 에러](./rules/db-error-handling.md)
