# Walk-Forward 백테스팅 방법론

## 1. 개요

Walk-Forward Analysis는 **과최적화(Over-fitting)를 방지**하기 위한 백테스트 기법입니다.

**핵심 원칙:**
- 데이터를 In-Sample (IS)과 Out-of-Sample (OOS)로 분할
- IS에서 최적화, OOS에서 검증
- 시간 순서대로 Rolling Window 방식으로 반복

## 2. 기본 구조

### 2.1 60/40 분할

```typescript
interface WalkForwardConfig {
  total_period_days: number;     // 전체 기간 (예: 365일)
  in_sample_ratio: number;       // IS 비율 (예: 0.6)
  out_of_sample_ratio: number;   // OOS 비율 (예: 0.4)
  step_size_days: number;        // Rolling 간격 (예: 30일)
}

const DEFAULT_CONFIG: WalkForwardConfig = {
  total_period_days: 365,
  in_sample_ratio: 0.6,          // 60%
  out_of_sample_ratio: 0.4,      // 40%
  step_size_days: 30,            // 월단위 롤링
};
```

### 2.2 Rolling Window

```
|-------- 365 days ---------|

Window 1:
|--- IS (219d) ---|-- OOS (146d) --|

Window 2 (30일 후):
        |--- IS (219d) ---|-- OOS (146d) --|

Window 3 (60일 후):
                |--- IS (219d) ---|-- OOS (146d) --|
```

## 3. 구현 예시

```typescript
interface BacktestResult {
  window_id: number;
  is_period: { start: string; end: string };
  oos_period: { start: string; end: string };
  is_performance: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
  };
  oos_performance: {
    total_return: number;
    sharpe_ratio: number;
    max_drawdown: number;
  };
  optimized_params: Record<string, any>;
}

async function runWalkForwardAnalysis(
  strategy: TradingStrategy,
  data: MarketData[],
  config: WalkForwardConfig
): Promise<BacktestResult[]> {
  const results: BacktestResult[] = [];

  const isSizeDays = Math.floor(config.total_period_days * config.in_sample_ratio);
  const oosSizeDays = Math.floor(config.total_period_days * config.out_of_sample_ratio);

  let windowStart = 0;

  while (windowStart + isSizeDays + oosSizeDays <= data.length) {
    // 1. IS 데이터 추출
    const isData = data.slice(windowStart, windowStart + isSizeDays);

    // 2. IS에서 파라미터 최적화
    const optimizedParams = optimizeParameters(strategy, isData);

    // 3. IS 성과 계산
    const isPerformance = backtest(strategy, isData, optimizedParams);

    // 4. OOS 데이터 추출
    const oosData = data.slice(
      windowStart + isSizeDays,
      windowStart + isSizeDays + oosSizeDays
    );

    // 5. OOS 성과 계산 (동일 파라미터)
    const oosPerformance = backtest(strategy, oosData, optimizedParams);

    results.push({
      window_id: results.length + 1,
      is_period: {
        start: isData[0].date,
        end: isData[isData.length - 1].date,
      },
      oos_period: {
        start: oosData[0].date,
        end: oosData[oosData.length - 1].date,
      },
      is_performance: isPerformance,
      oos_performance: oosPerformance,
      optimized_params: optimizedParams,
    });

    // 6. 다음 윈도우로 이동
    windowStart += config.step_size_days;
  }

  return results;
}
```

## 4. 성과 평가

### 4.1 IS vs OOS 성과 비교

```typescript
function evaluateWalkForward(results: BacktestResult[]): {
  avg_is_return: number;
  avg_oos_return: number;
  degradation: number;       // IS 대비 OOS 성과 저하율
  consistency: number;       // OOS 결과 일관성
  pass: boolean;
} {
  const avgIsReturn = results.reduce((sum, r) => sum + r.is_performance.total_return, 0) / results.length;
  const avgOosReturn = results.reduce((sum, r) => sum + r.oos_performance.total_return, 0) / results.length;

  // 성과 저하율
  const degradation = ((avgIsReturn - avgOosReturn) / avgIsReturn) * 100;

  // OOS 일관성 (표준편차)
  const oosReturns = results.map(r => r.oos_performance.total_return);
  const oosStdDev = calculateStdDev(oosReturns);
  const consistency = oosStdDev / Math.abs(avgOosReturn);

  // 합격 기준
  const pass = degradation < 30 && avgOosReturn > 0 && consistency < 1.0;

  return {
    avg_is_return: avgIsReturn,
    avg_oos_return: avgOosReturn,
    degradation,
    consistency,
    pass,
  };
}

// 예시
const evaluation = evaluateWalkForward(walkForwardResults);
// {
//   avg_is_return: 25.5,
//   avg_oos_return: 18.2,
//   degradation: 28.6,  // 28.6% 성과 저하
//   consistency: 0.45,
//   pass: true
// }
```

### 4.2 합격 기준

| 지표 | 기준 | 의미 |
|------|------|------|
| Degradation | < 30% | IS 대비 OOS 성과 저하 30% 이내 |
| Avg OOS Return | > 0% | OOS 평균 수익률 플러스 |
| Consistency | < 1.0 | OOS 결과 변동성 낮음 |

## 5. 참고 문헌

1. **Evidence-Based Technical Analysis** - David Aronson
2. **Algorithmic Trading** - Ernest Chan
3. **Building Winning Algorithmic Trading Systems** - Kevin Davey

---

**마지막 업데이트:** 2026-02-15
**버전:** 1.0
