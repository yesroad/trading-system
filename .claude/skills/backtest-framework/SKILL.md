---
name: backtest-framework
description: 전문가급 백테스팅 방법론 - Walk-forward, 슬리피지 모델링, 실패 사례. "백테스트", "전략 검증" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 2.0.0
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
- In-Sample: 전략 학습
- Out-of-Sample: 실전 성과 검증
- Rolling Window: 30일 단위 이동

### 2. 현실적 가정
- **슬리피지:** `--slippage-bps 30` (편도 30bp, Stress 테스트 기준)
- **수수료:** 기본 0.05%
- **시장 충격:** 고정 bps 모델

### 3. 방법론 편향 제거 (필수)

| 편향 종류 | 원인 | 해결책 |
|---------|------|------|
| **Lookahead Bias** | OOS 수익률 기준 레짐 필터 | IS 마지막 종가 vs IS MA200 비교 |
| **생존 편향 (DD)** | 누적 DD 중단 → 손실 창 제외 | Rolling DD (`--dd-lookback 12`) |
| **과적합** | 짧은 기간 파라미터 최적화 | 3년 이상 기간, 파라미터 최소화 |

---

## 사용 가능한 전략

| 전략 | 커맨드 | 적합 시장 |
|------|--------|----------|
| Simple MA | `--strategy simple-ma` | 기준선 비교용 |
| Enhanced MA | `--strategy enhanced-ma` | **미장 (MSFT, QQQ, SPY)** — 추세 시장 |
| Enhanced MA + 200MA 필터 | `--strategy enhanced-ma --use-200ma-filter` | 장기 추세, 약세장 회피 |
| BB Squeeze | `--strategy bb-squeeze` | **코인 (KRW-BTC), 국장** — 고변동성/박스권 |
| Regime-Adaptive | `--strategy regime-adaptive` | 자동 전략 전환 (코인에 효과적) |

### 시장별 전략 가이드 (검증 결과 기반)

| 시장 | 최적 전략 | 이유 |
|------|----------|------|
| 미장 (MSFT/QQQ/SPY) | `enhanced-ma` | 지속 추세, Sharpe 0.53 PASS |
| 코인 (KRW-BTC) | `bb-squeeze` | 수렴→대폭발, Sharpe 0.96 |
| 국장 (000660 등) | `bb-squeeze` | 박스권 돌파 특화 |

> **주의:** 미장에 `bb-squeeze` 적용 시 FAIL (Median 음수). 미장은 지속 상승으로 수렴 신호 드묾.

---

## 포트폴리오 Walk-Forward 권장 설정

### 기본 (2023~현재)
```bash
node dist/cli.js portfolio-wf \
  --symbols "MSFT,QQQ,SPY,KRW-BTC" \
  --start 2023-01-01 --end 2026-02-18 \
  --in-sample 180 --out-sample 90 --step 30 \
  --max-positions 4 --min-oos-trades 1 \
  --spy-filter \
  --max-symbol-weight 0.25 \
  --min-symbol-window-ratio 0.2 --warmup 210 \
  --slippage-bps 30 \
  --dd-reduce-pct 8 --dd-halt-pct 15 \
  --dd-lookback 12 \
  --symbol-ma-filter --symbol-ma-period 50 \
  --us-strategy enhanced-ma \
  --crypto-strategy bb-squeeze
```

**기대 성과:** Positive 58%, Median +2.25%, Sharpe 0.62, MDD 12.81%

### 장기 (2020~현재, Rolling DD 필수)
```bash
  --start 2020-01-01 --dd-lookback 12
```
> Rolling DD 없이 2020 BTC 불장 포함 시 창 30+ 영구 중단 (생존 편향).

---

## DD 기반 리스크 관리

```bash
--dd-reduce-pct 8    # DD 8% → 다음 창 포지션 50% 감속
--dd-halt-pct 15     # DD 15% → 다음 창 현금 전환
--dd-lookback 12     # 최근 12창 rolling 기준 (0=전체 누적)
```

**Rolling DD 효과 (2020~2026):**
- 누적 DD: 창 30~66 모두 영구 중단 (37창 생존 편향)
- Rolling DD 12창: 중단 창 7개로 감소, 현실적 성과 반영

---

## Symbol MA 필터

```bash
--symbol-ma-filter --symbol-ma-period 50
```

- 각 심볼의 IS 마지막 종가 < MA(N) → 해당 창 해당 심볼 제외
- MA50 최적 (MA20: FAIL 과도 필터, MA100/200: 효과 미미)
- 효과: MDD 17.09% → 15.95%

---

## SPY MA200 레짐 필터

```bash
--spy-filter
```

- SPY IS 마지막 종가 < IS MA200 → 미장 신규 Long 금지
- Lookahead Bias 없음 (IS 데이터만 사용)
- 이전 방식(OOS 수익률 -3% 기준)은 Lookahead Bias → 사용 금지

---

## 실전 신호 생성

```bash
# 포트폴리오 단위 신호 (시장별 전략 자동 적용)
node dist/cli.js portfolio-signal \
  --symbols "MSFT,QQQ,SPY,KRW-BTC" \
  --spy-filter \
  --symbol-ma-filter --symbol-ma-period 50 \
  --us-strategy enhanced-ma \
  --crypto-strategy bb-squeeze \
  --dry-run

# 실제 DB 저장
  --no-dry-run
```

---

## 시장별 전략 CLI 옵션

```bash
--us-strategy <name>       # 미장(yf) 전략
--crypto-strategy <name>   # 코인(upbit) 전략
--krx-strategy <name>      # 국장(kis) 전략
# 값: regime-adaptive | enhanced-ma | bb-squeeze | simple-ma
```

---

## 성과 기준 (OOS Consistency)

| 판정 | 조건 |
|------|------|
| ✅ PASS | Positive Windows ≥ 40% AND Median OOS Return ≥ 0% |
| ⚠️ MARGINAL | Positive Windows 30~40% OR Median -2%~0% |
| ❌ FAIL | Positive Windows < 30% OR Median < -2% |

### 슬리피지 기준

| 모드 | 설정 | 용도 |
|------|------|------|
| Stress | `--slippage-bps 30` | 기본 포트폴리오 WF |
| Stress Fair Compare | `--stress-compare` | 0/30/50bp 동일창 비교 |

---

## 백테스트 체크리스트

```
1. 방법론 편향 3종 제거
   □ Lookahead Bias: IS MA200 기준 레짐 필터 사용
   □ 생존 편향: Rolling DD (--dd-lookback 12) 적용
   □ 과적합: 3년 이상 기간, 파라미터 최소화

2. 시장별 전략 선택
   □ 미장 → enhanced-ma
   □ 코인 → bb-squeeze
   □ 국장 → bb-squeeze (데이터 18개월 제약)

3. Walk-Forward OOS Consistency PASS 확인

4. Stress 슬리피지 (30bp) 조건에서도 PASS 유지

5. portfolio-signal로 실전 신호 검증 (dry-run)
```

---

## 실패 패턴

### 과최적화
- 짧은 기간(1~2년)에 파라미터 최적화 → OOS 참패
- 해결: 기간 확장, 파라미터 기본값 유지

### Lookahead Bias (레짐 필터)
- OOS 수익률 기준 레짐 필터 → 미래 정보 사용
- 해결: IS 데이터 기준 MA200 비교

### DD 생존 편향
- 누적 DD 중단으로 손실 창 제외 → Median 과대평가
- 해결: Rolling DD (최근 12창)

### 시장 특성 무시
- 미장에 BB Squeeze 적용 → FAIL (지속 추세에 수렴 신호 없음)
- 해결: 시장별 전략 분리 (`--us-strategy`, `--crypto-strategy`)

---

**통합:** `risk-management` 룰 적용 필수
