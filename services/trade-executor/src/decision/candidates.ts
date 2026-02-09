import Big from 'big.js';
import { TRADING_CONFIG } from '../config/trading.js';
import { marketToBroker } from '../config/markets.js';
import type { AiAnalysisRow } from '../db/queries.js';
import type { Candidate, Position, TradeAction } from './types.js';

type PickCandidatesParams = {
  analyses: AiAnalysisRow[];
  positions: Position[];
  limit?: number;
};

function toBigOrZero(value: number | null): Big {
  if (value === null) return new Big(0);
  try {
    return new Big(value);
  } catch {
    return new Big(0);
  }
}

function hasPositivePositionQty(position: Position | undefined): boolean {
  if (!position) return false;
  try {
    return new Big(position.qty).gt(0);
  } catch {
    return false;
  }
}

function decideAction(params: {
  aiDecision: AiAnalysisRow['decision'];
  hasPosition: boolean;
  confidence: number;
}): { action: TradeAction; reason: string } {
  const { aiDecision, hasPosition, confidence } = params;

  if (confidence < TRADING_CONFIG.minConfidence) {
    return {
      action: 'SKIP',
      reason: `confidence below threshold (${confidence.toFixed(4)} < ${TRADING_CONFIG.minConfidence})`,
    };
  }

  if (aiDecision === 'BLOCK') {
    if (hasPosition) {
      return { action: 'SELL', reason: 'BLOCK recommendation with open position' };
    }
    return { action: 'SKIP', reason: 'BLOCK recommendation but no position' };
  }

  if (aiDecision === 'ALLOW') {
    if (!hasPosition) {
      return { action: 'BUY', reason: 'ALLOW recommendation and no open position' };
    }
    return { action: 'SKIP', reason: 'ALLOW recommendation but already holding position' };
  }

  return { action: 'SKIP', reason: 'CAUTION recommendation' };
}

/**
 * AI 분석 결과 + 현재 포지션을 결합해 실행 후보를 생성한다.
 * - 같은 symbol은 최신 AI 결과 1건만 사용
 * - min confidence 미달은 SKIP
 * - BUY/SELL/SKIP 액션을 함께 반환
 */
export function pickCandidates(params: PickCandidatesParams): Candidate[] {
  const limit = Math.max(1, Math.min(500, Math.floor(params.limit ?? TRADING_CONFIG.maxCandidatesPerMarket)));

  const latestBySymbol = new Map<string, AiAnalysisRow>();

  // created_at desc라는 전제가 없더라도 입력 순서를 보존하며 첫 항목(최신)만 사용
  for (const row of params.analyses) {
    if (!latestBySymbol.has(row.symbol)) {
      latestBySymbol.set(row.symbol, row);
    }
  }

  const positionsByKey = new Map<string, Position>();
  for (const pos of params.positions) {
    const key = `${pos.broker}:${pos.market}:${pos.symbol}`;
    positionsByKey.set(key, pos);
  }

  const candidates: Candidate[] = [];

  for (const ai of latestBySymbol.values()) {
    const broker = marketToBroker(ai.market);

    const key = `${broker}:${ai.market}:${ai.symbol}`;
    const position = positionsByKey.get(key);
    const hasPosition = hasPositivePositionQty(position);

    const { action, reason } = decideAction({
      aiDecision: ai.decision,
      hasPosition,
      confidence: ai.confidence,
    });

    const positionQty = position ? toBigOrZero(position.qty).toString() : '0';
    const avgPrice = position?.avgPrice === null || position?.avgPrice === undefined
      ? null
      : toBigOrZero(position.avgPrice).toString();

    candidates.push({
      market: ai.market,
      broker,
      symbol: ai.symbol,
      aiAnalysisId: ai.id,
      aiDecision: ai.decision,
      confidence: ai.confidence,
      summary: ai.summary,
      hasPosition,
      positionQty,
      avgPrice,
      action,
      reason,
      createdAt: ai.created_at,
    });
  }

  // 실행 가능 액션(BUY/SELL) 우선 정렬 후 confidence 내림차순
  candidates.sort((a, b) => {
    const rank = (c: Candidate): number => (c.action === 'SKIP' ? 1 : 0);
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return b.confidence - a.confidence;
  });

  return candidates.slice(0, limit);
}
