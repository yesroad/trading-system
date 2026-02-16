import { createLogger } from '@workspace/shared-utils';
import {
  searchStocks,
  getKeyMetrics,
  getDividendHistory,
  batchGetKeyMetrics,
} from '../api/fmp-client.js';
import { calculateDividendMetrics, calculateCompositeScore } from './metrics.js';
import type {
  DividendScreeningCriteria,
  ScreenedStock,
  ScreeningResult,
  FMPStock,
  FMPKeyMetrics,
} from '../types.js';

const logger = createLogger('dividend-screener');

/**
 * 배당주 스크리닝
 *
 * @param criteria - 스크리닝 기준
 * @returns 스크리닝 결과
 */
export async function screenDividendStocks(
  criteria: DividendScreeningCriteria
): Promise<ScreeningResult> {
  const startTime = Date.now();

  logger.info('배당주 스크리닝 시작', { criteria });

  // 1. FMP Stock Screener API로 후보 조회
  const candidates = await searchStocks({
    marketCapMoreThan: criteria.minMarketCap,
    dividendMoreThan: criteria.minYield, // FMP API는 0-100 범위가 아닌 0.0-1.0 범위
    sector: criteria.sectors?.[0], // FMP는 단일 섹터만 지원
    exchange: 'NYSE,NASDAQ', // 미국 주식만
    limit: 1000, // 최대 1000개
  });

  logger.info('후보 종목 조회 완료', { count: candidates.length });

  // 2. REIT 필터링
  let filteredCandidates = candidates;
  if (criteria.excludeREITs) {
    filteredCandidates = candidates.filter((stock) => {
      const sector = stock.sector?.toLowerCase() || '';
      const industry = stock.industry?.toLowerCase() || '';
      return !sector.includes('reit') && !industry.includes('reit');
    });
    logger.info('REIT 제외 후', { count: filteredCandidates.length });
  }

  // 3. 각 종목의 상세 정보 조회 및 필터링
  const screenedStocks: ScreenedStock[] = [];

  for (const stock of filteredCandidates) {
    try {
      // Key Metrics 조회
      const keyMetrics = await getKeyMetrics(stock.symbol);

      // 배당 히스토리 조회
      const dividendHistory = await getDividendHistory(stock.symbol);

      // 필터링 조건 체크
      if (!passesFilters(stock, keyMetrics, criteria)) {
        continue;
      }

      // 배당 지표 계산
      const dividendMetrics = calculateDividendMetrics({
        stock,
        keyMetrics,
        dividendHistory,
      });

      // 배당 성장률 필터
      if (criteria.minDividendGrowth && dividendMetrics.dividendCAGR) {
        if (dividendMetrics.dividendCAGR.toNumber() < criteria.minDividendGrowth) {
          continue;
        }
      }

      // 배당 성향 필터
      if (criteria.maxPayoutRatio && dividendMetrics.payoutRatio) {
        if (dividendMetrics.payoutRatio.toNumber() > criteria.maxPayoutRatio) {
          continue;
        }
      }

      // 복합 점수 계산
      const compositeScore = calculateCompositeScore({
        dividendMetrics,
        peRatio: keyMetrics?.peRatio || null,
        pbRatio: keyMetrics?.pbRatio || null,
        roe: keyMetrics?.roe || null,
        debtToEquity: keyMetrics?.debtToEquity || null,
      });

      // 스크리닝 결과 추가
      screenedStocks.push({
        symbol: stock.symbol,
        companyName: stock.companyName,
        sector: stock.sector || null,
        industry: stock.industry || null,
        marketCap: stock.marketCap,
        price: stock.price,
        dividendMetrics,
        valuationMetrics: {
          peRatio: keyMetrics?.peRatio || null,
          pbRatio: keyMetrics?.pbRatio || null,
          debtToEquity: keyMetrics?.debtToEquity || null,
          currentRatio: keyMetrics?.currentRatio || null,
          roe: keyMetrics?.roe || null,
        },
        compositeScore,
      });

      logger.debug('종목 통과', {
        symbol: stock.symbol,
        score: compositeScore,
      });
    } catch (error) {
      logger.warn('종목 분석 실패 (스킵)', {
        symbol: stock.symbol,
        error,
      });
    }
  }

  // 4. 복합 점수 기준 정렬 (내림차순)
  screenedStocks.sort((a, b) => b.compositeScore - a.compositeScore);

  const executionTimeMs = Date.now() - startTime;

  logger.info('배당주 스크리닝 완료', {
    totalCandidates: filteredCandidates.length,
    passedCount: screenedStocks.length,
    executionTimeMs,
  });

  return {
    criteria,
    stocks: screenedStocks,
    totalCandidates: filteredCandidates.length,
    passedCount: screenedStocks.length,
    executionTimeMs,
  };
}

/**
 * 필터링 조건 통과 여부 확인
 */
function passesFilters(
  stock: FMPStock,
  keyMetrics: FMPKeyMetrics | null,
  criteria: DividendScreeningCriteria
): boolean {
  // P/E 필터
  if (criteria.maxPE && keyMetrics?.peRatio) {
    if (keyMetrics.peRatio > criteria.maxPE) {
      return false;
    }
  }

  // P/B 필터
  if (criteria.maxPB && keyMetrics?.pbRatio) {
    if (keyMetrics.pbRatio > criteria.maxPB) {
      return false;
    }
  }

  // 섹터 필터
  if (criteria.sectors && criteria.sectors.length > 0) {
    if (!stock.sector || !criteria.sectors.includes(stock.sector)) {
      return false;
    }
  }

  return true;
}

/**
 * 상위 N개 종목 조회
 */
export async function getTopDividendStocks(params: {
  criteria: DividendScreeningCriteria;
  limit: number;
}): Promise<ScreenedStock[]> {
  const { criteria, limit } = params;

  const result = await screenDividendStocks(criteria);

  return result.stocks.slice(0, limit);
}
