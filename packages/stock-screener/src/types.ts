import { z } from 'zod';
import Big from 'big.js';

// ============================================================
// FMP API Responses
// ============================================================

/**
 * FMP Stock Screener API Response
 */
export const FMPStockSchema = z.object({
  symbol: z.string(),
  companyName: z.string(),
  marketCap: z.number(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  beta: z.number().optional(),
  price: z.number(),
  lastAnnualDividend: z.number().optional(),
  volume: z.number().optional(),
  exchange: z.string().optional(),
  exchangeShortName: z.string().optional(),
});

export type FMPStock = z.infer<typeof FMPStockSchema>;

/**
 * FMP Key Metrics API Response
 */
export const FMPKeyMetricsSchema = z.object({
  symbol: z.string(),
  date: z.string(),
  period: z.string(),
  revenuePerShare: z.number().nullable().optional(),
  netIncomePerShare: z.number().nullable().optional(),
  operatingCashFlowPerShare: z.number().nullable().optional(),
  freeCashFlowPerShare: z.number().nullable().optional(),
  cashPerShare: z.number().nullable().optional(),
  bookValuePerShare: z.number().nullable().optional(),
  tangibleBookValuePerShare: z.number().nullable().optional(),
  shareholdersEquityPerShare: z.number().nullable().optional(),
  interestDebtPerShare: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  enterpriseValue: z.number().nullable().optional(),
  peRatio: z.number().nullable().optional(),
  priceToSalesRatio: z.number().nullable().optional(),
  pocfratio: z.number().nullable().optional(),
  pfcfRatio: z.number().nullable().optional(),
  pbRatio: z.number().nullable().optional(),
  ptbRatio: z.number().nullable().optional(),
  evToSales: z.number().nullable().optional(),
  enterpriseValueOverEBITDA: z.number().nullable().optional(),
  evToOperatingCashFlow: z.number().nullable().optional(),
  evToFreeCashFlow: z.number().nullable().optional(),
  earningsYield: z.number().nullable().optional(),
  freeCashFlowYield: z.number().nullable().optional(),
  debtToEquity: z.number().nullable().optional(),
  debtToAssets: z.number().nullable().optional(),
  netDebtToEBITDA: z.number().nullable().optional(),
  currentRatio: z.number().nullable().optional(),
  interestCoverage: z.number().nullable().optional(),
  incomeQuality: z.number().nullable().optional(),
  dividendYield: z.number().nullable().optional(),
  payoutRatio: z.number().nullable().optional(),
  salesGeneralAndAdministrativeToRevenue: z.number().nullable().optional(),
  researchAndDdevelopementToRevenue: z.number().nullable().optional(),
  intangiblesToTotalAssets: z.number().nullable().optional(),
  capexToOperatingCashFlow: z.number().nullable().optional(),
  capexToRevenue: z.number().nullable().optional(),
  capexToDepreciation: z.number().nullable().optional(),
  stockBasedCompensationToRevenue: z.number().nullable().optional(),
  grahamNumber: z.number().nullable().optional(),
  roic: z.number().nullable().optional(),
  returnOnTangibleAssets: z.number().nullable().optional(),
  grahamNetNet: z.number().nullable().optional(),
  workingCapital: z.number().nullable().optional(),
  tangibleAssetValue: z.number().nullable().optional(),
  netCurrentAssetValue: z.number().nullable().optional(),
  investedCapital: z.number().nullable().optional(),
  averageReceivables: z.number().nullable().optional(),
  averagePayables: z.number().nullable().optional(),
  averageInventory: z.number().nullable().optional(),
  daysSalesOutstanding: z.number().nullable().optional(),
  daysPayablesOutstanding: z.number().nullable().optional(),
  daysOfInventoryOnHand: z.number().nullable().optional(),
  receivablesTurnover: z.number().nullable().optional(),
  payablesTurnover: z.number().nullable().optional(),
  inventoryTurnover: z.number().nullable().optional(),
  roe: z.number().nullable().optional(),
  capexPerShare: z.number().nullable().optional(),
});

export type FMPKeyMetrics = z.infer<typeof FMPKeyMetricsSchema>;

/**
 * FMP Dividend History API Response
 */
export const FMPDividendHistorySchema = z.object({
  date: z.string(),
  label: z.string().optional(),
  adjDividend: z.number(),
  dividend: z.number(),
  recordDate: z.string().optional(),
  paymentDate: z.string().optional(),
  declarationDate: z.string().optional(),
});

export type FMPDividendHistory = z.infer<typeof FMPDividendHistorySchema>;

// ============================================================
// Dividend Screening
// ============================================================

/**
 * 배당주 스크리닝 기준
 */
export interface DividendScreeningCriteria {
  minYield: number; // 최소 배당 수익률 (예: 3.0 = 3%)
  maxPE?: number; // 최대 P/E (예: 20)
  maxPB?: number; // 최대 P/B (예: 2.0)
  minMarketCap: number; // 최소 시가총액 (USD)
  minDividendGrowth?: number; // 최소 배당 성장률 (3년 CAGR, 예: 5.0 = 5%)
  maxPayoutRatio?: number; // 최대 배당 성향 (예: 80.0 = 80%)
  sectors?: string[]; // 특정 섹터만 (선택사항)
  excludeREITs?: boolean; // REIT 제외 여부
}

/**
 * 배당 지표
 */
export interface DividendMetrics {
  yield: Big; // 배당 수익률
  payoutRatio: Big | null; // 배당 성향 (배당금 / 순이익)
  dividendCAGR: Big | null; // 3년 배당 성장률 (CAGR)
  sustainability: 'high' | 'medium' | 'low'; // 지속가능성
  lastDividend: number; // 마지막 배당금
  dividendHistory: FMPDividendHistory[]; // 배당 히스토리
}

/**
 * 스크리닝된 종목
 */
export interface ScreenedStock {
  symbol: string;
  companyName: string;
  sector: string | null;
  industry: string | null;
  marketCap: number;
  price: number;
  dividendMetrics: DividendMetrics;
  valuationMetrics: {
    peRatio: number | null;
    pbRatio: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    roe: number | null;
  };
  compositeScore: number; // 0-100 점수
}

/**
 * 스크리닝 결과
 */
export interface ScreeningResult {
  criteria: DividendScreeningCriteria;
  stocks: ScreenedStock[];
  totalCandidates: number;
  passedCount: number;
  executionTimeMs: number;
}
