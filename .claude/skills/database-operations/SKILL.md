---
name: database-operations
description: Supabase 스키마 확인, 쿼리 작성/검증, db-client 우선 적용 규칙을 사용할 때 사용.
metadata:
  author: yesroad
  version: 1.1.0
  category: database
---

# Database Operations (Lean)

스키마/쿼리 관련 작업에서 반복 지시를 줄이기 위한 절차형 가이드.

## Core Rules
- 서비스 간 데이터 교환은 DB 경유
- 공통 DB 동작은 `@workspace/db-client` 우선
- 서비스 특수 쿼리만 `getSupabase()` 직접 사용
- 쿼리마다 `error` 처리 필수

## Query Workflow
1. 대상 테이블/컬럼을 먼저 확인
2. 기존 `@workspace/db-client` 함수 재사용 가능성 확인
3. 없으면 서비스 내부에서 최소 쿼리 작성
4. 입력/출력 타입과 런타임 검증(Zod 필요 시) 적용
5. 실패 로그(테이블, 키, 에러 메시지) 남기기

## Review Checklist
1. where 조건이 PK/인덱스와 정합적인가
2. upsert/update 시 키 누락이 없는가
3. timestamp는 ISO 규칙(`nowIso`)을 따르는가
4. nullable 컬럼 처리 누락이 없는가

## Notes
- 테이블 상세 스키마는 실제 Supabase(또는 마이그레이션 파일)를 최신 소스로 본다.
- 문서 예시는 참고용이며, 실행 전 실제 스키마와 반드시 대조한다.
