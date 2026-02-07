# ESLint Config 규칙

## 목적
모노레포 전체에서 사용하는 공유 ESLint 설정 패키지. Web(Next.js)과 Node.js 환경별 설정 제공.

## 관계
- 의존: 없음 (루트 패키지)
- 사용처: apps/web, services/ai-analyzer, services/kis-collector, services/yf-collector

## 명령어
```bash
# 이 패키지는 설정만 export하므로 별도 명령어 없음
# 다른 워크스페이스에서 import하여 사용
```

## 의존성

### 외부 (주요)
- @eslint/js: 9.39 - ESLint 기본 설정
- eslint: 9.28 - 린터
- eslint-config-prettier: 10.1 - Prettier 충돌 비활성화
- eslint-plugin-prettier: 5.4 - Prettier를 ESLint 규칙으로 실행
- eslint-plugin-tailwindcss: 3.18 - Tailwind 클래스 정렬
- eslint-plugin-unused-imports: 4.1 - 미사용 import 제거
- globals: 17.0 - 전역 변수 정의

## 구조
```
packages/eslint-config/
├── package.json
├── web.js       # Next.js/React 앱용 설정
└── node.js      # Node.js 서비스용 설정
```

## Exports
```js
// 사용 예시
// apps/web/eslint.config.mjs
import webConfig from '@workspace/eslint-config/web';
export default [...webConfig, /* 추가 설정 */];

// services/*/eslint.config.mjs
import nodeConfig from '@workspace/eslint-config/node';
export default [...nodeConfig, /* 추가 설정 */];
```

## 로컬 규칙

### 해야 할 것
- ESLint 9 flat config 형식 사용
- Prettier 규칙 통합하여 일관된 포맷팅
- unused-imports 플러그인으로 깔끔한 import 유지
- 환경별로 적절한 설정 export (web/node)

### 하지 말아야 할 것
- 워크스페이스별로 다른 포맷팅 규칙 적용
- .eslintrc 레거시 형식 사용
- Prettier와 충돌하는 규칙 추가

## Prettier 설정 (공통)
```js
{
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  bracketSameLine: false,
}
```

## 참고
공유 패턴: 모노레포 전체 컨벤션은 루트 AGENTS.md 참조.

## React/UI 스킬 적용 범위
- `dashboard-ui-skill`, `react-best-practices`, `web-design-guidelines`, `composition-patterns`는 `apps/*`의 React/Next.js UI 작업에서만 적용한다.
- 이 워크스페이스(`services/*`, `packages/*`) 작업에는 기본 적용하지 않는다. 필요한 경우에만 예외로 명시한다.
