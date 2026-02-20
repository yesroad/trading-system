---
name: strategy-optimizer
description: 시장 조건별 최적 전략 선택 및 필터 파라미터 결정 가이드. "전략 선택", "어떤 전략", "필터 설정", "전략 최적화" 요청 시 사용.
user-invocable: true
metadata:
  author: yesroad
  version: 1.0.0
  category: strategy-selection
  priority: high
---

# Strategy Optimizer

트레이딩 시스템의 전략 선택 및 파라미터 최적화 가이드

## 사용 가능한 전략

### 1. Enhanced MA (enhanced-ma)
**파일:** `services/backtest-engine/src/strategies/enhanced-ma-strategy.ts`

**핵심 로직:**
- 단기/장기 이평선 골든/데드 크로스
- ATR 기반 손절매
- 장기 MA 기울기 필터 (상승 추세일 때만 진입)

**옵션 필터:**
- `--use-200ma-filter`: 가격 > 200일선일 때만 Long 허용 (약세장 차단)
- `--use-adx-filter --adx-threshold 20`: ADX > 20일 때만 진입 (횡보장 차단)

**적합 종목:**
- 국내주식 (005930, 000660 등): `--short-ma 10 --long-ma 20`
- 미국주식 (AAPL, MSFT 등): `--short-ma 10 --long-ma 30`
- 암호화폐 (KRW-BTC): `--short-ma 5 --long-ma 20`

---

### 2. BB Squeeze (bb-squeeze)
**파일:** `services/backtest-engine/src/strategies/bb-squeeze-strategy.ts`

**핵심 로직 (John Carter 방식):**
1. BB(20, 2.0)가 Keltner Channel(20, ATR×1.5) 안으로 수축 → Squeeze ON
2. Squeeze 해제 + 상방 돌파 → BUY
3. 종가 < BB 하단 OR ATR 손절 → SELL

**적합 종목:**
- 고변동성 성장주: NVDA, TSLA, AMD
- 박스권 → 폭발 패턴 반복 종목
- 거래량이 크고 변동성이 높은 심볼

**파라미터 기본값:**
```
--bb-period 20 --bb-stddev 2.0 --keltner-multiplier 1.5 --atr-multiplier 2.0
```

---

### 3. Regime-Adaptive (regime-adaptive)
**파일:** `services/backtest-engine/src/strategies/regime-adaptive-strategy.ts`

**핵심 로직:**
1. 시장 국면 자동 감지 (RegimeDetector 사용)
2. 국면별 최적 전략 자동 선택:
   - TRENDING_UP → Enhanced MA (추세 추종)
   - TRENDING_DOWN → HOLD (신규 진입 중단, 기존 포지션 손절만)
   - SIDEWAYS / WEAK_TREND → BB Squeeze (변동성 돌파)

**적합 상황:**
- 국면 전환이 빈번한 종목
- 하락 추세 회피가 중요한 경우
- 자동 전략 전환을 원할 때

**사용 예시:**
```bash
node dist/cli.js run -s 005930 --strategy regime-adaptive \
  --start-date 2023-01-01 --end-date 2026-02-19
```

---

### 4. Simple MA (simple-ma)
**파일:** `services/backtest-engine/src/strategies/simple-ma-crossover.ts`

**적합 상황:** 기준선 비교, 필터 없는 순수 이평선 테스트

---

## 전략 선택 매트릭스

| 시장 국면 | 변동성 | 권장 전략 | 이유 |
|---------|--------|----------|------|
| TRENDING_UP | 낮음~중간 | Enhanced MA | 추세 추종, 안정적 상승 |
| TRENDING_UP | 높음 | Enhanced MA + 200MA | 200MA 필터로 리스크 관리 |
| TRENDING_DOWN | 모두 | HOLD (또는 Regime-Adaptive) | 신규 진입 중단, 손절만 |
| SIDEWAYS | 낮음 | HOLD | 거래 비용만 발생 |
| SIDEWAYS | 중간~높음 | BB Squeeze | 변동성 돌파 포착 |
| WEAK_TREND | 모두 | BB Squeeze | 불명확 추세, 짧은 돌파 노림 |
| 국면 전환 빈번 | 모두 | Regime-Adaptive | 자동 전략 전환 |

### 종목 유형별 권장

| 시장 | 변동성 | 추세 | 권장 전략 | 필터 |
|------|--------|------|----------|------|
| 국내주식 | 낮음 | 강한 추세 | enhanced-ma | 200MA |
| 국내주식 | 보통 | 횡보 많음 | bb-squeeze 또는 regime-adaptive | 기본값 |
| 미국주식 | 낮음 | 강한 추세 | enhanced-ma | 200MA 필터 |
| 미국주식 | 높음 | 박스권 多 | bb-squeeze | 기본값 |
| 암호화폐 | 매우 높음 | 변동성 큼 | bb-squeeze | ATR 배수 3.0 |

---

## 시장 국면 감지 (Regime Detection)

### detect-regime 명령어 사용

```bash
node dist/cli.js detect-regime -s <심볼> \
  --start-date 2023-01-01 \
  --end-date 2026-02-19 \
  --window 30
```

**출력 예시:**
```
날짜       | 국면           | 신뢰도 | ADX  | 권장 전략
-----------|---------------|--------|------|-------------
2023-01-15 | TRENDING_UP    | 85.0%  | 28.5 | enhanced-ma
2023-02-15 | SIDEWAYS       | 72.3%  | 15.2 | bb-squeeze
2023-03-15 | TRENDING_DOWN  | 90.1%  | 32.8 | none
```

### 국면 분류 기준

| 국면 | ADX | SMA50 vs SMA200 | SMA50 기울기 | 의미 |
|------|-----|----------------|-------------|------|
| TRENDING_UP | > 25 | 위 | 상승 | 강한 상승 추세 |
| TRENDING_DOWN | > 25 | 아래 | 하락 | 강한 하락 추세 |
| SIDEWAYS | < 20 | - | - | 횡보장 |
| WEAK_TREND | 20-25 | - | - | 불명확 추세 |

### 활용 방법

1. **전체 기간 국면 분포 확인**
   ```bash
   node dist/cli.js detect-regime -s 005930 \
     --start-date 2022-01-01 --end-date 2026-02-19 --window 30
   ```

2. **국면 분포에 따른 전략 선택**
   - TRENDING_DOWN 비율 > 20% → Regime-Adaptive (리스크 관리)
   - SIDEWAYS 비율 > 40% → BB Squeeze 우선
   - TRENDING_UP 비율 > 40% → Enhanced MA 우선

3. **실험 결과 (2022-2026, 한국 주식)**
   - 005930, 000660 모두 SIDEWAYS 47.6%
   - TRENDING_DOWN 비율: 005930 14.3%, 000660 0%
   - BB Squeeze가 가장 안정적 성과 (Positive Windows 40%)

---

## Walk-Forward 윈도우 설정 가이드

### 단기 (권장 기본값)
```bash
--in-sample 90 --out-sample 30 --step 15
```
- 최소 데이터: 약 180일 (6개월)
- OOS 신뢰도: 보통
- 과최적화 위험: 낮음

### 장기 (충분한 데이터 보유 시)
```bash
--in-sample 180 --out-sample 60 --step 30
```
- 최소 데이터: 약 365일 (1년)
- OOS 신뢰도: 높음
- 과최적화 위험: 중간

---

## 사용 예시

### 종목별 권장 커맨드

```bash
# 005930 (삼성전자) — 안정적 추세 종목
node dist/cli.js run -s 005930 --strategy enhanced-ma \
  --use-200ma-filter --use-adx-filter --adx-threshold 20 \
  --short-ma 10 --long-ma 20 --slope-period 10

# NVDA — 고변동성 성장주
node dist/cli.js run -s NVDA --strategy bb-squeeze \
  --bb-period 20 --bb-stddev 2.0 --keltner-multiplier 1.5

# KRW-BTC — 암호화폐
node dist/cli.js run -s KRW-BTC --strategy bb-squeeze \
  --atr-multiplier 3.0 --keltner-multiplier 2.0

# Walk-Forward (새 기본값 90/30/15)
node dist/cli.js walk-forward -s 000660 --strategy enhanced-ma \
  --use-200ma-filter
```

---

## 필터 설정 판단 기준

### 200MA 필터 (`--use-200ma-filter`)
- **사용해야 할 때:** 종목이 장기 하락 추세에 빠지는 경우가 잦을 때
- **사용하지 않을 때:** 단기 스윙 트레이딩, 암호화폐 (변동성 너무 큼)
- **필요 데이터:** 최소 250일 이상 캔들

### ADX 필터 (`--use-adx-filter`)
- **ADX > 20:** 추세 시작 (진입 허용)
- **ADX > 25:** 강한 추세 (더 보수적)
- **ADX < 20:** 횡보 (진입 차단)
- **사용해야 할 때:** 이평선 전략의 횡보 구간 손실이 클 때

### BB Squeeze 파라미터 조정
- `--bb-stddev 1.5`: 더 좁은 BB → 진입 신호 증가
- `--bb-stddev 2.5`: 더 넓은 BB → 진입 신호 감소 (보수적)
- `--keltner-multiplier 2.0`: KC 확장 → Squeeze 조건 완화 (더 자주 Squeeze)
- `--atr-multiplier 3.0`: 손절 여유 증가 (암호화폐 권장)

---

## 성과 평가 기준

### OOS Consistency 통과 기준 (Walk-Forward)

**✅ PASS:**
- Positive Windows ≥ 40%
- Median OOS Return > 0%
- Max Drawdown < 20%

**⚠️ MARGINAL:**
- Positive Windows 30-40%
- Median OOS Return -2% ~ 0%

**❌ FAIL:**
- Positive Windows < 30%
- Median OOS Return < -2%

### 전략별 목표 기준

| 전략 | Positive Windows | Median OOS | Max DD |
|------|-----------------|-----------|--------|
| Enhanced MA | ≥ 45% | > 0% | < 15% |
| Enhanced MA + 200MA | ≥ 40% | > 0% | < 18% |
| BB Squeeze | ≥ 40% | > -1% | < 20% |
| Regime-Adaptive | ≥ 42% | > 0% | < 18% |

### 백테스트 지표

| 지표 | 최소 통과 | 우수 |
|------|----------|------|
| Sharpe Ratio | > 0.5 | > 1.0 |
| Max Drawdown | < 30% | < 15% |
| Win Rate | > 40% | > 50% |
| Profit Factor | > 1.2 | > 1.5 |

### 2022-2026 실험 결과 요약

**종목:** 005930, 000660 (한국 주식)

| 전략 | 005930 Positive | 000660 Positive | 평가 |
|------|----------------|----------------|------|
| Enhanced MA | 23.8% | 9.5% | ❌ FAIL |
| Enhanced MA + 200MA | 19.0% | 14.3% | ❌ FAIL |
| Enhanced MA + 200MA + ADX | 24.1% | 0% | ❌ FAIL |
| BB Squeeze | 41.7% | 40.0% | ⚠️ MARGINAL |
| Regime-Adaptive | 41.7% | 40.0% | ⚠️ MARGINAL |

**결론:**
- 2022-2026 기간은 SIDEWAYS 47.6% (박스권 많음)
- BB Squeeze가 가장 안정적 (Median OOS -2.86%, -1.82%)
- 모든 전략이 Median OOS < 0% (통과 실패)
- 이유: TRENDING_DOWN 구간에서 큰 손실 발생

---

**통합:** `backtest-framework` 룰 + `risk-management` 룰 적용 필수
