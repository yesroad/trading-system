import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import type {
  FMPStock,
  FMPKeyMetrics,
  FMPDividendHistory,
  DividendMetrics,
} from '../types.js';
import { calculate3YearDividendCAGR } from '../api/fmp-client.js';

const logger = createLogger('dividend-metrics');

/**
 * 배당 수익률 계산
 *
 * @param lastDividend - 연간 배당금
 * @param price - 현재 주가
 * @returns 배당 수익률 (%)
 */
export function calculateDividendYield(lastDividend: number, price: number): Big {
  if (price === 0) {
    return Big(0);
  }

  return Big(lastDividend).div(price).times(100);
}

/**
 * 배당 성향 계산 (Payout Ratio)
 *
 * @param dividendPerShare - 주당 배당금
 * @param earningsPerShare - 주당 순이익 (EPS)
 * @returns 배당 성향 (%)
 */
export function calculatePayoutRatio(
  dividendPerShare: number,
  earningsPerShare: number | null
): Big | null {
  if (earningsPerShare === null || earningsPerShare === 0) {
    return null;
  }

  return Big(dividendPerShare).div(earningsPerShare).times(100);
}

/**
 * 배당 지속가능성 평가
 *
 * @param payoutRatio - 배당 성향 (%)
 * @param debtToEquity - 부채비율
 * @param currentRatio - 유동비율
 * @returns 지속가능성 등급
 */
export function assessSustainability(params: {
  payoutRatio: Big | null;
  debtToEquity: number | null;
  currentRatio: number | null;
}): 'high' | 'medium' | 'low' {
  const { payoutRatio, debtToEquity, currentRatio } = params;

  let score = 0;

  // 배당 성향 체크 (낮을수록 지속가능)
  if (payoutRatio) {
    const ratio = payoutRatio.toNumber();
    if (ratio < 50) {
      score += 3; // 매우 안전
    } else if (ratio < 70) {
      score += 2; // 안전
    } else if (ratio < 90) {
      score += 1; // 주의
    } else {
      score += 0; // 위험
    }
  }

  // 부채비율 체크 (낮을수록 안전)
  if (debtToEquity !== null) {
    if (debtToEquity < 0.5) {
      score += 2;
    } else if (debtToEquity < 1.0) {
      score += 1;
    } else {
      score += 0;
    }
  }

  // 유동비율 체크 (높을수록 안전)
  if (currentRatio !== null) {
    if (currentRatio > 2.0) {
      score += 2;
    } else if (currentRatio > 1.5) {
      score += 1;
    } else {
      score += 0;
    }
  }

  // 점수 기반 등급 부여
  if (score >= 6) {
    return 'high';
  } else if (score >= 3) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * 종목의 배당 지표 계산
 *
 * @param stock - FMP Stock 정보
 * @param keyMetrics - FMP Key Metrics
 * @param dividendHistory - 배당 히스토리
 * @returns 배당 지표
 */
export function calculateDividendMetrics(params: {
  stock: FMPStock;
  keyMetrics: FMPKeyMetrics | null;
  dividendHistory: FMPDividendHistory[];
}): DividendMetrics {
  const { stock, keyMetrics, dividendHistory } = params;

  // 배당 수익률 계산
  const lastDividend = stock.lastAnnualDividend || 0;
  const yieldPct = calculateDividendYield(lastDividend, stock.price);

  // 배당 성향 계산
  let payoutRatio: Big | null = null;
  if (keyMetrics && keyMetrics.netIncomePerShare) {
    payoutRatio = calculatePayoutRatio(lastDividend, keyMetrics.netIncomePerShare);
  }

  // 배당 성장률 계산 (3년 CAGR)
  let dividendCAGR: Big | null = null;
  const cagr = calculate3YearDividendCAGR(dividendHistory);
  if (cagr !== null) {
    dividendCAGR = Big(cagr);
  }

  // 지속가능성 평가
  const sustainability = assessSustainability({
    payoutRatio,
    debtToEquity: keyMetrics?.debtToEquity || null,
    currentRatio: keyMetrics?.currentRatio || null,
  });

  return {
    yield: yieldPct,
    payoutRatio,
    dividendCAGR,
    sustainability,
    lastDividend,
    dividendHistory,
  };
}

/**
 * 복합 점수 계산 (0-100)
 *
 * 배당 수익률, 배당 성장률, 밸류에이션, 재무 건전성을 종합 평가
 */
export function calculateCompositeScore(params: {
  dividendMetrics: DividendMetrics;
  peRatio: number | null;
  pbRatio: number | null;
  roe: number | null;
  debtToEquity: number | null;
}): number {
  const { dividendMetrics, peRatio, pbRatio, roe, debtToEquity } = params;

  let score = 0;

  // 1. 배당 수익률 (30점)
  const yieldPct = dividendMetrics.yield.toNumber();
  if (yieldPct >= 5.0) {
    score += 30;
  } else if (yieldPct >= 4.0) {
    score += 25;
  } else if (yieldPct >= 3.0) {
    score += 20;
  } else if (yieldPct >= 2.0) {
    score += 10;
  } else {
    score += 0;
  }

  // 2. 배당 성장률 (25점)
  if (dividendMetrics.dividendCAGR) {
    const cagrPct = dividendMetrics.dividendCAGR.toNumber();
    if (cagrPct >= 15.0) {
      score += 25;
    } else if (cagrPct >= 10.0) {
      score += 20;
    } else if (cagrPct >= 5.0) {
      score += 15;
    } else if (cagrPct >= 0) {
      score += 5;
    } else {
      score += 0;
    }
  }

  // 3. 밸류에이션 (25점)
  let valuationScore = 0;

  if (peRatio !== null && peRatio > 0) {
    if (peRatio < 10) {
      valuationScore += 15;
    } else if (peRatio < 15) {
      valuationScore += 10;
    } else if (peRatio < 20) {
      valuationScore += 5;
    }
  }

  if (pbRatio !== null && pbRatio > 0) {
    if (pbRatio < 1.0) {
      valuationScore += 10;
    } else if (pbRatio < 1.5) {
      valuationScore += 5;
    } else if (pbRatio < 2.0) {
      valuationScore += 2;
    }
  }

  score += Math.min(valuationScore, 25);

  // 4. 재무 건전성 (20점)
  let healthScore = 0;

  if (roe !== null && roe > 0) {
    if (roe >= 15) {
      healthScore += 10;
    } else if (roe >= 10) {
      healthScore += 5;
    }
  }

  if (debtToEquity !== null) {
    if (debtToEquity < 0.5) {
      healthScore += 10;
    } else if (debtToEquity < 1.0) {
      healthScore += 5;
    }
  }

  score += Math.min(healthScore, 20);

  // 최종 점수 (0-100)
  return Math.min(Math.max(score, 0), 100);
}
