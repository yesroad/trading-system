// analysis/selectTargets.ts
import type { Snapshot } from './collectSnapshot.js';
import { Market } from '../config/markets.js';
import { getTopDividendStocks } from '@workspace/stock-screener';
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('select-targets');

export type SelectedTarget = {
  symbol: string;
  score: number;
  reason: string;
};

export async function selectTargets(maxTargets: number, snapshot: Snapshot): Promise<SelectedTarget[]> {
  const targets: SelectedTarget[] = [];

  // 1. 성공한 수집 runs에서 symbols 추출
  const successfulRuns = snapshot.ingestion.recentRuns.filter((r) => r.status === 'success');
  const collectedSymbols = successfulRuns.flatMap((r) => r.symbols ?? []).filter(Boolean);
  const uniqueCollected = Array.from(new Set(collectedSymbols));

  // 기본 타겟 추가 (최근 수집 성공)
  uniqueCollected.forEach((symbol, idx) => {
    targets.push({
      symbol,
      score: 100 - idx, // 높은 점수 (우선순위)
      reason: '최근 수집 성공',
    });
  });

  // 2. US 마켓의 경우 배당주 추가
  if (snapshot.market === Market.US) {
    try {
      logger.info('배당주 스크리닝 시작');
      const dividendStocks = await getTopDividendStocks({
        criteria: {
          minYield: 3.0,
          maxPE: 20,
          maxPB: 2.0,
          minMarketCap: 2_000_000_000, // $2B+
          excludeREITs: true,
        },
        limit: 20, // 상위 20개 배당주
      });

      logger.info('배당주 스크리닝 완료', { count: dividendStocks.length });

      // 배당주 타겟 추가
      dividendStocks.forEach((stock, idx) => {
        // 이미 수집된 종목이 아닌 경우만 추가
        if (!targets.some((t) => t.symbol === stock.symbol)) {
          targets.push({
            symbol: stock.symbol,
            score: 80 - idx, // 수집 성공 종목보다 낮은 점수
            reason: `배당주 (수익률: ${stock.dividendMetrics.yield.toFixed(2)}%, 점수: ${stock.compositeScore.toFixed(1)})`,
          });
        }
      });
    } catch (error) {
      logger.error('배당주 스크리닝 실패', { error });
      // 에러 발생 시에도 기존 타겟으로 진행
    }
  }

  // 3. 점수 기준 정렬 + maxTargets 제한
  targets.sort((a, b) => b.score - a.score);
  return targets.slice(0, maxTargets);
}
