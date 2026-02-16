---
name: agents-generator
description: 프로젝트를 분석하고 AGENTS.md 규칙 시스템을 생성하거나 업데이트합니다. 모노레포 자동 감지 및 워크스페이스별 중첩 파일 생성.
disable-model-invocation: false
argument-hint: '[선택사항: 특정 워크스페이스 경로]'
metadata:
  author: yesroad
  version: 1.0.0
  category: documentation
  priority: high
---

# AGENTS.md Generator

## 목적

프로젝트를 분석하고 최적화된 AGENTS.md 규칙 시스템을 생성하거나 업데이트합니다:

1. **신규 생성** — AGENTS.md가 없으면 전체 구조 자동 생성
2. **자동 업데이트** — 기존 파일이 있으면 diff 분석 후 개선사항 적용
3. **모노레포 지원** — 각 워크스페이스마다 중첩 AGENTS.md 생성
4. **프레임워크 감지** — Next.js, TypeScript/Node.js 패턴 자동 적용

## 실행 시점

- 새 프로젝트 시작 시 AGENTS.md 생성
- 워크스페이스 추가/삭제 후 규칙 파일 업데이트
- 주요 의존성 변경 후 문서 동기화
- 프로젝트 구조 리팩토링 후 라우팅 정보 갱신

## 핵심 원칙

- **파일당 500라인 제한**
- **이모지 금지, 군더더기 금지** — 모든 줄은 실행 가능해야 함
- **중앙 통제 + 위임** — 루트 파일이 전문 파일로 라우팅
- **자가 치유** — 규칙이 코드와 괴리될 때 업데이트 트리거
- **발견 가능성** — 의심스러우면 파일 생성

## 실행 프로토콜

### Step 0: 모드 판단

```bash
# 기존 AGENTS.md 확인
ls AGENTS.md 2>/dev/null && echo "UPDATE_MODE" || echo "CREATE_MODE"
```

**모드:**
- **UPDATE_MODE** — 기존 파일 분석 → diff → 개선사항 적용
- **CREATE_MODE** — 새 파일 생성

### Step 1: 프로젝트 분석

다음 파일을 순서대로 확인:

```bash
# 필수 확인
ls package.json 2>/dev/null
ls tsconfig.json 2>/dev/null
find . -maxdepth 3 -type d ! -path "*/node_modules/*" ! -path "*/.git/*"

# 워크스페이스 설정
cat package.json | grep -A 10 '"workspaces"'
ls pnpm-workspace.yaml 2>/dev/null
ls turbo.json 2>/dev/null

# 기존 문서
ls README.md AGENTS.md .claude/rules/*.md 2>/dev/null
```

**판단 항목:**
1. 프로젝트 유형 (Monorepo / Backend / Frontend / Fullstack)
2. 주요 프레임워크 (Next.js / Express / NestJS)
3. 워크스페이스 구조 (apps/*, packages/*, services/*)
4. 기존 컨벤션 (.eslintrc, .prettierrc)

### Step 2: 프로젝트 유형 감지

**MONOREPO 신호:**
- 루트 package.json에 "workspaces" 필드
- pnpm-workspace.yaml 또는 turbo.json 존재
- apps/, packages/, services/ 폴더에 자체 package.json
- 서로 다른 레벨에 여러 package.json 파일

**FRONTEND (Next.js) 신호:**
- 프레임워크: next
- 파일: app/, pages/, components/
- 의존성: react, next

**BACKEND (Node.js) 신호:**
- 프레임워크: express, nestjs, fastify
- 파일: src/, routes/, controllers/, services/
- 의존성: @supabase/supabase-js, prisma

### Step 3: 업데이트 모드 (기존 파일이 있는 경우)

#### 3.1 기존 파일 분석

```bash
# 기존 AGENTS.md 읽기
cat AGENTS.md

# 현재 워크스페이스 목록
find apps packages services -maxdepth 1 -type d -exec sh -c 'ls {}/package.json 2>/dev/null && echo {}' \; 2>/dev/null
```

**비교 항목:**
1. 새로 추가된 워크스페이스 감지
2. 변경된 의존성 감지 (package.json 비교)
3. 삭제된 모듈 감지
4. 프레임워크 버전 변경 감지

#### 3.2 Diff 생성

```markdown
### 변경사항 분석

| 항목 | 현재 | 기존 AGENTS.md | 액션 |
|------|------|---------------|------|
| 워크스페이스 | apps/web, packages/db-client | packages/db-client | apps/web 추가 |
| 의존성 | next@15.0 | next@14.0 | 버전 업데이트 |
| 모듈 | (없음) | packages/old-lib | 참조 제거 |
```

### Step 4: 중첩 파일 생성 규칙

#### 4.1 생성 트리거

다음 신호 중 **하나라도** 존재하면 중첩 AGENTS.md 생성:

- **별도 package.json 존재** — 모노레포의 각 워크스페이스
- **프레임워크 경계** — apps/web (Next.js) vs services/api (Node.js)
- **고유 런타임 환경** — Edge Functions, Workers

#### 4.2 모노레포 특별 규칙

모노레포 감지 시:
1. **루트 AGENTS.md 생성** — 공유 패턴 및 워크스페이스 간 규칙
2. **각 워크스페이스마다 중첩 AGENTS.md** — 자체 package.json이 있는 모든 워크스페이스
3. **예외 없음** — 유사한 패턴도 각자 파일 생성

중첩 파일 규칙:
- 공유 규칙은 루트 참조: `공통 패턴은 루트 AGENTS.md 참조`
- 워크스페이스별 명령어 문서화 (dev, build, test, lint)
- 내부 의존성 관계 명시

#### 4.3 최소 중첩 파일 내용

```markdown
# [워크스페이스명] 규칙

## 목적
[이 워크스페이스가 하는 일 1-2문장]

## 관계
- 의존: [이 패키지가 import하는 내부 패키지]
- 사용처: [이 패키지를 import하는 내부 패키지]

## 명령어
```bash
dev:   [명령어]
build: [명령어]
test:  [명령어]
```

## 의존성

### 내부
- @workspace/[패키지]: [목적]

### 외부 (주요)
- [패키지]: [버전] — [사용 이유]

## 로컬 규칙
공통 패턴은 루트 AGENTS.md 참조.
[워크스페이스별 특수 규칙...]

## 참고
[배포 대상, 빌드 고려사항 등]
```

### Step 5: AGENTS.md 생성

#### 5.1 루트 파일 스키마

```markdown
# 프로젝트 규칙

## 개요
[1-2문장: 무엇을, 누구를 위해, 왜]

## 기술 스택
- 런타임: [Node.js 버전]
- 빌드 시스템: [Turborepo / Nx / Lerna]
- 언어: [TypeScript 버전]
- 데이터베이스: [PostgreSQL / Supabase]
- 주요 라이브러리: [핵심 3-5개]

## 명령어
```bash
dev:   [명령어]
build: [명령어]
test:  [명령어]
lint:  [명령어]
```

## 아키텍처
```
[간소화된 트리, 최대 15줄]
```

[데이터 흐름 1-2문장]

## 골든 룰

### 불변
- [위반 불가한 보안/아키텍처 제약]

### 해야 할 것
- [이 스택에 맞는 긍정적 패턴]

### 하지 말아야 할 것
- [간단한 이유와 함께 안티패턴]

## 표준
- 파일: [네이밍 컨벤션]
- 함수: [네이밍 컨벤션]
- 커밋: [형식]

## 내부 의존성
[모노레포 패키지 목록]

## 컨텍스트 라우팅
- **[작업/영역](./경로/AGENTS.md)** — 읽어야 할 때

## 유지보수
규칙과 구현 사이의 불일치를 표시하라. 업데이트를 제안하라.
```

#### 5.2 중첩 파일 스키마 (모노레포 워크스페이스)

```markdown
# [워크스페이스명] 규칙

## 목적
[모노레포 컨텍스트에서 이 워크스페이스가 하는 일]

## 관계
- 의존: [import하는 내부 패키지]
- 사용처: [사용하는 내부 패키지]

## 명령어
```bash
dev:   [로컬 개발 명령어]
build: [로컬 빌드 명령어]
test:  [로컬 테스트 명령어]
```

## 의존성

### 내부 (모노레포 내)
- @workspace/[패키지]: [목적]

### 외부 (주요)
- [패키지]: [버전] — [사용 이유]

## 로컬 규칙
공통 패턴은 루트 AGENTS.md 참조.

## 참고
[배포 대상, 특별 빌드 고려사항]
```

### Step 6: 프레임워크별 규칙

#### Next.js (App Router)

**해야 할 것:**
- 기본으로 Server Components 사용
- Server Actions로 mutation
- SEO를 위한 Metadata API

**하지 말아야 할 것:**
- 정당한 이유 없이 'use client'
- useEffect에서 fetch() (Server Components 사용)
- 컴포넌트에서 직접 데이터베이스 접근

#### TypeScript/Node.js (Services/Packages)

**해야 할 것:**
- strict mode 유지
- 외부 API 응답은 Zod 검증
- 비즈니스 로직은 서비스 레이어에

**하지 말아야 할 것:**
- 명시적 any 사용
- 에러 처리 없는 DB/API 호출
- 서비스 간 직접 import (DB 경유)

### Step 7: 출력 파일 선택

```bash
# Cursor 확인
ls .cursor/ 2>/dev/null && echo "USE_.cursorrules" || echo "USE_AGENTS.md"
```

**파일명 규칙:**
- `.cursor/` 존재 → `.cursorrules` (루트) + `[폴더]/.cursorrules`
- 기본값 → `AGENTS.md` (루트) + `[폴더]/AGENTS.md`

### Step 8: 검증

출력 전 확인:

```bash
# 파일 라인 수 확인 (500줄 이하)
wc -l AGENTS.md

# 이모지 검사
grep -E '[\x{1F600}-\x{1F64F}]' AGENTS.md && echo "EMOJI_FOUND" || echo "OK"

# 경로 유효성 확인
grep -o '\./[^)]*' AGENTS.md | while read path; do
  ls "$path" 2>/dev/null || echo "BROKEN: $path"
done
```

**체크리스트:**
- [ ] 파일당 500줄 미만
- [ ] 이모지 없음
- [ ] 모든 명령어 실행 가능
- [ ] 컨텍스트 라우팅 경로 유효
- [ ] 프레임워크별 패턴 포함
- [ ] 워크스페이스별 명령어 문서화 (모노레포)
- [ ] 내부 의존성 관계 명시 (모노레포)

### Step 9: 업데이트 로그 생성

```markdown
## AGENTS.md 업데이트 로그

### 모드: [CREATE / UPDATE]

### 생성/업데이트된 파일:
- `/AGENTS.md` (루트) — [생성/업데이트]
- `/apps/web/AGENTS.md` — 생성 (새 워크스페이스)
- `/packages/db-client/AGENTS.md` — 의존성 섹션 업데이트

### 변경사항 요약:
- 워크스페이스 추가: apps/web
- 의존성 업데이트: next@14 → next@15
- 참조 제거: packages/old-lib (삭제됨)

### 총계:
- 생성: N개
- 업데이트: M개
- 삭제 권장: K개
```

## 예외 처리

| 상황 | 조치 |
|------|------|
| 기술 스택 판단 불가 | AskUserQuestion: "[파일]을 찾았습니다. [X] 프로젝트인가요?" |
| 혼합/불명확한 컨벤션 | 충돌 문서화, 명시적 규칙 선택, 결정 기록 |
| 최소 프로젝트 (< 5 파일) | 단일 간결한 AGENTS.md 생성 (100줄 미만) |
| 기존 규칙 파일 존재 | 유용한 내용 보존, diff 분석 후 개선사항만 적용 |
| 최소 고유 규칙의 워크스페이스 | 발견 가능성을 위해 최소 내용으로 파일 생성 |
| 중첩 파일 필요 여부 불확실 | 생성 — 없는 것보다 있는 게 낫다 |
| 기존 파일이 최신 상태 | "변경사항 없음" 메시지 출력 후 종료 |

## Related Files

| File | Purpose |
|------|---------|
| `/AGENTS.md` | 루트 규칙 파일 (이 스킬이 생성/업데이트) |
| `/apps/*/AGENTS.md` | 앱별 규칙 (이 스킬이 생성/업데이트) |
| `/packages/*/AGENTS.md` | 패키지별 규칙 (이 스킬이 생성/업데이트) |
| `/services/*/AGENTS.md` | 서비스별 규칙 (이 스킬이 생성/업데이트) |
| `/.claude/rules/*.md` | 상세 규칙 문서 (참조) |

## 사용 예시

### 새 프로젝트

```
사용자: "AGENTS.md 생성해줘"
→ 프로젝트 분석 → 전체 구조 생성 → 로그 출력
```

### 기존 프로젝트

```
사용자: "AGENTS.md 업데이트"
→ 기존 파일 분석 → diff 계산 → 변경사항만 적용 → 로그 출력
```

### 특정 워크스페이스

```
사용자: "packages/db-client에 AGENTS.md 추가해줘"
→ 해당 워크스페이스만 분석 → 중첩 파일 생성
```

## 품질 기준

생성되거나 업데이트된 모든 파일은 다음을 갖추어야 합니다:

- **실행 가능한 명령어** — 플레이스홀더 없이 실제 실행 가능
- **유효한 파일 경로** — 컨텍스트 라우팅의 모든 경로가 실제 존재
- **일관된 형식** — 기존 파일과 동일한 섹션 구조
- **프레임워크별 규칙** — 감지된 프레임워크에 맞는 패턴
- **내부 의존성 명시** — 모노레포에서 @workspace/* 관계 문서화
