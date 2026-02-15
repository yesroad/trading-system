---
name: backtest-framework
description: 전문가급 백테스팅 방법론 - Walk-forward, 슬리피지 모델링, 실패 사례. "백테스트", "전략 검증" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: strategy-testing
  priority: critical
  sources:
    - tradermonty/backtest-expert
    - jmanhype/qts backtesting logic
---

# Backtest Framework

전문가급 트레이딩 전략 검증 프레임워크

## 핵심 원칙

### 1. Walk-Forward Testing
- In-Sample: 60%
- Out-of-Sample: 40%
- Rolling Window: 6개월 단위

### 2. 현실적 가정
- **슬리피지:** Upbit 0.05%, Binance 0.1%
- **수수료:** Maker/Taker 차별
- **시장 충격:** 대량 주문 시 불리한 가격

### 3. 생존 편향 제거
- 상장폐지 종목 포함
- 역사적 유니버스 사용

## 성과 기준

### 필수 통과
- Sharpe Ratio > 1.0
- Max Drawdown < 20%
- Win Rate > 45%
- Profit Factor > 1.5

### 우수
- Sharpe Ratio > 2.0
- Max Drawdown < 10%
- Win Rate > 55%

## 백테스트 체크리스트

```
1. 가설 정의
   - 전략 논리 명확화
   - 진입/청산 조건

2. 파라미터 로버스트 테스트
   - 민감도 분석
   - 과최적화 방지

3. Walk-Forward 검증
   - Out-of-Sample 성과 확인

4. 실패 사례 검토
   - 최악 시나리오 분석
   - 리스크 관리 보완

5. Production 배포
   - Paper Trading 3개월
   - 실전 투입
```

## 실패 패턴 (반드시 검토)

### 과최적화
- 파라미터 100개 조합 → In-Sample 완벽
- Out-of-Sample 참패

### Look-Ahead Bias
- 미래 데이터 사용 (재무제표 발표 전 접근)

### 생존 편향
- 살아남은 종목만 테스트
- 상장폐지 종목 제외

## 참고 문서

- `references/walk-forward-methodology.md`: 상세 프로세스
- `references/slippage-modeling.md`: 거래소별 슬리피지
- `references/failed-backtest-cases.md`: 실패 사례 10건

---

**통합:** `risk-management` 룰 적용 필수
