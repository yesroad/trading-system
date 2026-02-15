---
name: commit-helper
description: staged 변경사항 기준 커밋 메시지 자동 생성. "커밋", "commit", "커밋 메시지" 입력 시 사용.
user-invocable: true
disable-model-invocation: false
metadata:
  author: yesroad
  version: 1.0.0
  category: development
  priority: medium
---

# Commit Message Generator

staged 변경사항을 분석하여 프로젝트 컨벤션에 맞는 커밋 메시지 자동 생성

## 기본 원칙

- 반드시 `git diff --staged` 기준
- 요약 50자 이내
- 동사 현재형 (추가, 수정, 개선)
- 결과 중심 작성

## 실행 플로우

### 1. 컨벤션 감지

```bash
git log --oneline --format="%s" -20
```

**확인 항목:**

- 한글 vs 영어 타입
- Conventional Commits 여부 (feat:, fix:)
- scope 사용 패턴
- Body 사용 빈도

### 2. 변경사항 분석

```bash
git diff --staged --stat --name-status
git diff --staged
```

**체크 포인트:**

- 변경 파일 수
- 변경 영역 (apps/, packages/, services/)
- rename/move 포함 여부
- 설정 파일 변경 여부

### 3. 타입 결정

**기능:**

- `feat` / `기능` → 새 기능
- `fix` / `수정` → 버그 수정
- `perf` → 성능 개선

**구조:**

- `refactor` / `리팩토링` → 구조 개선
- `test` / `테스트` → 테스트 추가
- `docs` / `문서` → 문서 변경
- `chore` / `설정` → 빌드, 설정, 의존성

### 4. Scope 추론 (모노레포)

```
apps/web → (web)
services/trade-executor → (trade-executor)
packages/risk-engine → (risk-engine)
```

**여러 영역 변경 시:**

- 주요 변경 영역 우선
- 애매하면 scope 생략

### 5. Body 포함 조건

다음 중 하나 이상:

- ✅ 파일 3개 이상
- ✅ rename/move 포함
- ✅ 설정/의존성 변경
- ✅ 리스크 영역 (거래, 인증, DB)
- ✅ 변경 이유 설명 필요

### 6. Breaking Change

다음 시 `BREAKING CHANGE` 명시:

- DB 스키마 변경
- 환경변수 키 변경
- 공개 API 시그니처 변경

## 출력 형식

### Option 1: 기본 (권장)

```
{type}({scope}): {요약}

- 변경사항 1
- 변경사항 2
```

### Option 2: 간결

```
{type}({scope}): {요약}
```

### Option 3: 상세

```
{type}({scope}): {요약}

- 상세 변경사항 1
- 상세 변경사항 2
- 변경 이유
```

## 예외 처리

### staged 없음

```
❌ No staged changes. Use `git add` first.
```

### lockfile만

```
chore(deps): lockfile 업데이트
```

### 대량 파일 (100개+)

```
⚠️ 100개 이상 변경. 커밋 분리 권장.
```

### 리네임 중심

```
refactor: {before} → {after} 리네임
```

## 참고 자료

상세 가이드: `references/` 참고

- `type-guidelines.md`: 타입별 상세 기준
- `scope-rules.md`: scope 추론 규칙
- `breaking-change-examples.md`: Breaking Change 예시

---

**사용 예시:**

```
사용자: "커밋 메시지 만들어줘"

Claude: (컨벤션 감지 + 변경사항 분석)

## 🎯 권장 커밋 메시지

### Option 1: 기본 (권장)
feat(web): 사용자 대시보드 추가

- 실시간 차트 컴포넌트 구현
- API 연동 완료

### Option 2: 간결
feat(web): 사용자 대시보드 추가

### Option 3: 상세
feat(web): 사용자 대시보드 추가

- 실시간 차트 컴포넌트 구현 (Recharts)
- REST API 연동 (/api/user/dashboard)
- 반응형 레이아웃 (Tailwind)
- 로딩 상태 관리 (React Query)

변경 이유: 사용자 요청사항 반영
```
