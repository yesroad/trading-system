---
name: keybindings-help
description: Use when the user wants to customize keyboard shortcuts, rebind keys, add chord bindings, or modify ~/.claude/keybindings.json. Examples: "rebind ctrl+s", "add a chord shortcut", "change the submit key", "customize keybindings".
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: utility
  priority: normal
---

# Keybindings Help

Claude Code CLI 단축키 및 설정 빠른 참조

## 주요 명령어

### 대화 제어
- `/help` - 도움말 표시
- `/clear` - 대화 초기화
- `/exit` - Claude Code 종료

### 스킬 관련
- `/skills` - 사용 가능한 스킬 목록
- `/[skill-name]` - 특정 스킬 실행 (예: `/commit`, `/pr`)

### 파일 작업
- 파일 경로 입력 시 자동 컨텍스트 로드
- 스크린샷 경로 지정으로 이미지 분석

## 설정 파일 위치

### 키바인딩 설정
```
~/.claude/keybindings.json
```

### 프로젝트 설정
```
.claude/settings.local.json   (로컬, gitignore)
.claude/settings.json         (공유)
```

## 커스터마이징 예시

### 키바인딩 수정
```json
{
  "submit": "ctrl+enter",
  "newline": "shift+enter",
  "abort": "ctrl+c"
}
```

### Chord 바인딩 (연속 키 입력)
```json
{
  "commit": "ctrl+g c",
  "pr": "ctrl+g p"
}
```

## 프로젝트 설정

### MCP 서버 설정
```
.claude/mcp.json
```

### 스킬 디렉토리
```
.claude/skills/
```

### 규칙 파일
```
.claude/rules/
AGENTS.md
CLAUDE.md
```

## 권한 모드

- **Auto**: 안전한 도구 자동 실행
- **Prompt**: 모든 도구 실행 시 확인
- **Manual**: 명시적 승인 필요

## 참고

- 공식 문서: https://docs.anthropic.com/claude/claude-code
- 이슈 리포트: https://github.com/anthropics/claude-code/issues
