---
name: technical-analyst  
description: 차트 패턴, Elliott Wave, 피보나치 기반 기술적 분석. 차트 이미지 업로드 또는 "기술적 분석", "차트 분석" 요청 시 사용.
user-invocable: true
disable-model-invocation: false
metadata:
  author: yesroad
  version: 2.0.0
  category: trading-analysis
  priority: critical
  sources:
    - tradermonty/claude-trading-skills/technical-analyst
---

# Technical Analyst

주식, 암호화폐, 외환 차트의 전문적 기술적 분석

## 핵심 방법론

### Elliott Wave 분석
5파동 충격파 + 3파동 조정파 패턴 식별

**핵심 규칙:**
- 파동 2는 파동 1 시작점 이탈 금지
- 파동 3는 가장 길어야 함 (파동 1, 5보다)
- 파동 4는 파동 1 영역 침범 금지

### 피보나치 되돌림/확장
- 되돌림: 23.6%, 38.2%, 50%, 61.8%, 78.6%
- 확장: 127.2%, 161.8%, 261.8%

### 일목균형표 신호
- 전환선 > 기준선: 강세
- 가격 > 구름: 상승 추세
- 두꺼운 구름: 강한 지지/저항

## 출력 형식

### 시나리오 기반 확률 평가
```
## [심볼] 기술적 분석

현재 상태:
- Elliott Wave: [파동 위치]
- 피보나치: [수준]
- RSI/MACD: [지표값]

메인 시나리오 (60%): [설명]
- 트리거: [가격]
- 목표: [가격]
- 손절: [가격]

대안 시나리오 (30%): [설명]
극단 시나리오 (10%): [설명]
```

## 핵심 원칙

✅ 해야 할 것:
- 다중 시간대 분석 (일봉, 4시간봉, 1시간봉)
- 확률 기반 시나리오 (합계 100%)
- 명확한 트리거 가격
- 리스크/보상 비율 계산

❌ 하지 말아야 할 것:
- 절대적 예측
- 펀더멘털 편향
- 단일 지표 의존

## 참고 문서

상세 방법론은 `references/` 참고:
- `elliott-wave-theory.md`: 파동 이론
- `fibonacci-retracements.md`: 피보나치 활용
- `ichimoku-cloud.md`: 일목균형표
- `candlestick-patterns.md`: 캔들 패턴
- `dow-theory.md`: 다우 이론
- `technical-indicators.md`: RSI, MACD 등

## 사용 예시

```
사용자: "BTC 4시간봉 차트를 technical-analyst로 분석해줘"

Claude: (technical-analyst 로드)
        Elliott Wave 5파동 완성
        피보나치 61.8% 되돌림 목표: $85,000
        메인 시나리오 (65%): 조정 시작
```

---

**다음 단계:** `signal-generation` 스킬로 매매 신호 생성
