---
name: coding-standards
description: trading-system TypeScript 코딩 표준. strict mode 규칙, 네이밍, 에러 처리, 날짜/숫자 규칙을 빠르게 적용할 때 사용.
metadata:
  author: yesroad
  version: 1.1.0
  category: code-quality
---

# Coding Standards (Lean)

중복 규칙 원문은 `.claude/rules/immutable-rules.md`를 따른다.
이 스킬은 **코드 작성 시 즉시 적용할 실무 체크리스트**만 제공한다.

## Quick Checklist
- `any` 금지: `unknown` + 타입가드
- 외부 응답 검증: Zod
- 필수 env: `requireEnv`
- 날짜/시간: `nowIso`/`normalizeUtcIso` 또는 Luxon (`Date` 직접 사용 금지)
- 금액/수량/수익률: `big.js`
- DB: 공통 기능은 `@workspace/db-client` 우선

## Naming
- 파일: kebab-case
- 함수/변수: camelCase
- 타입/인터페이스/클래스: PascalCase
- 상수: UPPER_SNAKE_CASE

## Error Handling
- `catch (e: unknown)` 사용
- 빈 `catch {}` 금지
- 에러 메시지는 구조화 로그로 남기고 필요 시 rethrow

## Imports (권장 순서)
1. Node built-in
2. 외부 라이브러리
3. `@workspace/*`
4. 로컬 모듈

## When Reviewing Code
다음만 우선 확인:
1. 규칙 위반 여부 (`any`, `Date`, env 직접 접근)
2. 금액 계산 정밀도 (`big.js` 누락)
3. 런타임 검증/에러 처리 누락
