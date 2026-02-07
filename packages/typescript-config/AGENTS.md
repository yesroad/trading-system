# TypeScript Config 규칙

## 목적
모노레포 전체에서 사용하는 공유 TypeScript 설정 패키지. Web(Next.js)과 Node.js 환경별 tsconfig 베이스 제공.

## 관계
- 의존: 없음 (루트 패키지)
- 사용처: apps/web, services/ai-analyzer, services/kis-collector, services/yf-collector

## 명령어
```bash
# 이 패키지는 설정만 export하므로 별도 명령어 없음
# 다른 워크스페이스에서 extends하여 사용
```

## 구조
```
packages/typescript-config/
├── package.json
├── web.json     # Next.js/React 앱용 tsconfig
└── node.json    # Node.js 서비스용 tsconfig
```

## Exports
```json
// 사용 예시
// apps/web/tsconfig.json
{
  "extends": "@workspace/typescript-config/web",
  "compilerOptions": { /* 추가 옵션 */ }
}

// services/*/tsconfig.json
{
  "extends": "@workspace/typescript-config/node",
  "compilerOptions": { /* 추가 옵션 */ }
}
```

## 로컬 규칙

### 해야 할 것
- strict 모드 활성화
- 환경별 적절한 target/module 설정
- 경로 alias 일관성 유지

### 하지 말아야 할 것
- strict 모드 비활성화
- any 허용하는 관대한 설정 추가
- 워크스페이스별로 상충되는 설정

## 참고
공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.

## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
