# backtest-engine AGENTS.md

## 개요
트레이딩 전략 백테스트 엔진. Walk-Forward 검증, 슬리피지 모델링, 포트폴리오 단위 신호 생성 포함.

## 전략 파일

| 파일 | 전략 | 최적 시장 |
|------|------|----------|
| `src/strategies/simple-ma-crossover.ts` | Simple MA Crossover | 기준선 비교 |
| `src/strategies/enhanced-ma-strategy.ts` | Enhanced MA (ATR + 200MA/ADX 필터) | **미장 (MSFT, QQQ, SPY)** |
| `src/strategies/bb-squeeze-strategy.ts` | BB Squeeze (Keltner) | **코인 (KRW-BTC), 국장** |
| `src/strategies/regime-adaptive-strategy.ts` | Regime-Adaptive (자동 전략 전환) | 코인 (regime-adaptive ≈ bb-squeeze) |

### 시장별 전략 가이드 (2023~2026 검증 결과)

| 시장 | 전략 | Sharpe | MDD | 판정 |
|------|------|--------|-----|------|
| 미장 (MSFT/QQQ/SPY) | `enhanced-ma` | 0.53 | 22.74% | ✅ |
| 미장 (MSFT/QQQ/SPY) | `bb-squeeze` | 0.15 | 25.83% | ❌ FAIL |
| 코인 (KRW-BTC) | `bb-squeeze` | 0.96 | 19.84% | ✅ |
| 코인 (KRW-BTC) | `regime-adaptive` | 1.00 | 19.84% | ✅ |

## CLI 커맨드

```bash
# 단순 백테스트
node dist/cli.js run -s <symbol> --strategy <name> [options]

# Walk-Forward 분석
node dist/cli.js walk-forward -s <symbol> --strategy <name> [options]

# 포트폴리오 Walk-Forward (시장별 전략 분리 지원)
node dist/cli.js portfolio-wf \
  --symbols "MSFT,QQQ,SPY,KRW-BTC" \
  --us-strategy enhanced-ma \
  --crypto-strategy bb-squeeze \
  --krx-strategy bb-squeeze \
  [options]

# 포트폴리오 실전 신호 생성 (dry-run 기본)
node dist/cli.js portfolio-signal \
  --symbols "MSFT,QQQ,SPY,KRW-BTC" \
  --spy-filter \
  --symbol-ma-filter \
  --us-strategy enhanced-ma \
  --crypto-strategy bb-squeeze

# 단일 심볼 실시간 신호
node dist/cli.js signal -s <symbol> --strategy <name> [options]

# 시장 국면 감지
node dist/cli.js detect-regime -s <symbol> \
  --start-date YYYY-MM-DD --end-date YYYY-MM-DD
```

## 포트폴리오 WF 최적 설정 (2026-02-20 기준)

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
# 결과: Positive 58.3%, Median +2.25%, Sharpe 0.62, MDD 12.81%
```

## 주요 CLI 옵션 참조

### 시장별 전략 선택
```
--us-strategy <name>       미장(yf) 전략 (기본: enhanced-ma)
--crypto-strategy <name>   코인(upbit) 전략 (기본: bb-squeeze)
--krx-strategy <name>      국장(kis) 전략 (기본: bb-squeeze)
# 값: regime-adaptive | enhanced-ma | bb-squeeze | simple-ma
```

### DD 기반 리스크 관리
```
--dd-reduce-pct 8      DD 8% → 다음 창 포지션 50% 감속
--dd-halt-pct 15       DD 15% → 다음 창 현금 전환
--dd-lookback 12       최근 12창 Rolling DD (0=전체 누적, 영구 중단 위험)
```

### 레짐 / 필터
```
--spy-filter                  SPY IS MA200 기준 레짐 필터 (미장 차단)
--symbol-ma-filter            심볼별 MA50 필터 (하락 추세 심볼 제외)
--symbol-ma-period 50         심볼별 MA 기간 (50 최적, 20은 과도 필터)
```

### Enhanced MA 파라미터
```
--short-ma 10         단기 이평선
--long-ma 20          장기 이평선
--atr-multiplier 2.0  ATR 손절 배수
--slope-period 5      기울기 룩백 기간
--use-200ma-filter    200일 MA 레짐 필터
```

### BB Squeeze 파라미터
```
--bb-period 20             BB 기간
--bb-stddev 2.0            BB 표준편차 배수
--keltner-multiplier 1.5   Keltner ATR 배수
```

## 방법론 편향 주의사항

| 편향 | 문제 | 해결 |
|------|------|------|
| Lookahead Bias | OOS 수익률 기준 SPY 필터 | `--spy-filter` (IS MA200 기준) |
| 생존 편향 (DD) | 누적 DD 중단 → 손실 창 제외 | `--dd-lookback 12` |
| 과적합 | 단기 기간 파라미터 조정 | 기본값 유지, 3년+ 기간 |

> **2020~2026 주의:** Rolling DD 없이 실행 시 BTC 불장 peak 이후 창 30+ 영구 중단 (37창).

## 아키텍처

```
src/
├── cli.ts                          # Commander.js CLI 진입점
├── commands/
│   ├── live-signal.ts              # 단일 심볼 실시간 신호 생성
│   ├── portfolio-signal.ts         # 포트폴리오 실전 신호 생성 (시장별 전략)
│   ├── portfolio-wf.ts             # 포트폴리오 Walk-Forward 실행
│   └── detect-regime.ts            # 시장 국면 분석
├── engine/
│   ├── backtest.ts                 # 백테스트 실행 엔진
│   ├── walk-forward.ts             # 단일 심볼 Walk-Forward
│   └── portfolio-walk-forward.ts   # 포트폴리오 Walk-Forward
├── strategies/
│   ├── simple-ma-crossover.ts
│   ├── enhanced-ma-strategy.ts     # 미장 최적
│   ├── bb-squeeze-strategy.ts      # 코인/국장 최적
│   └── regime-adaptive-strategy.ts
├── models/
│   ├── slippage.ts                 # 슬리피지 모델
│   └── regime-detector.ts          # ADX + SMA 국면 감지
├── reports/
│   └── reporter.ts
└── data/
    └── loader.ts                   # upbit/kis/yf 캔들 로드
```

## 스킬 참조

- `backtest-framework`: WF 방법론, 성과 기준, 편향 제거 가이드
- `strategy-optimizer`: 시장 조건별 전략 선택 가이드
