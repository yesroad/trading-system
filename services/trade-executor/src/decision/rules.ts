import Big from 'big.js';
import { TRADING_CONFIG } from '../config/trading.js';
import type { Candidate, Decision } from './types.js';

type PriceInput = number | string;

export type ApplyTradingRulesParams = {
  candidates: Candidate[];
  currentPrices: Record<string, PriceInput | undefined>;
  dryRun?: boolean;
};

function resolveCurrentPrice(candidate: Candidate, prices: Record<string, PriceInput | undefined>): Big | null {
  const key1 = `${candidate.broker}:${candidate.market}:${candidate.symbol}`;
  const key2 = `${candidate.broker}:${candidate.symbol}`;
  const key3 = candidate.symbol;

  const raw = prices[key1] ?? prices[key2] ?? prices[key3];
  if (raw === undefined) return null;

  try {
    return new Big(raw);
  } catch {
    return null;
  }
}

function toNullableBig(value: string | null): Big | null {
  if (!value) return null;
  try {
    return new Big(value);
  } catch {
    return null;
  }
}

function makeDecision(candidate: Candidate, action: Decision['action'], reason: string, dryRun: boolean): Decision {
  return {
    action,
    market: candidate.market,
    broker: candidate.broker,
    symbol: candidate.symbol,
    confidence: candidate.confidence,
    aiDecision: candidate.aiDecision,
    aiAnalysisId: candidate.aiAnalysisId,
    reason,
    dryRun,
  };
}

/**
 * 최종 매매 규칙 적용.
 * 규칙:
 * - 매수: ALLOW + score(confidence) >= 0.7
 * - 매도: BLOCK / 손절(-5%) / 익절(+10%)
 * - 수익률 계산: (현재가 - 평단) / 평단 (big.js)
 */
export function applyTradingRules(params: ApplyTradingRulesParams): Decision[] {
  const dryRun = params.dryRun ?? TRADING_CONFIG.dryRun;
  const out: Decision[] = [];

  for (const candidate of params.candidates) {
    const score = candidate.confidence;

    // 1) BLOCK이면 보유 포지션 우선 매도
    if (candidate.aiDecision === 'BLOCK' && candidate.hasPosition) {
      out.push(makeDecision(candidate, 'SELL', 'BLOCK recommendation', dryRun));
      continue;
    }

    const qty = toNullableBig(candidate.positionQty) ?? new Big(0);
    const avgPrice = toNullableBig(candidate.avgPrice);
    const currentPrice = resolveCurrentPrice(candidate, params.currentPrices);

    // 2) 손절/익절 규칙 (보유 + 가격정보 유효할 때)
    if (qty.gt(0) && avgPrice && avgPrice.gt(0) && currentPrice && currentPrice.gt(0)) {
      const profitRate = currentPrice.minus(avgPrice).div(avgPrice);

      if (profitRate.lte(new Big(TRADING_CONFIG.stopLossPct).times(-1))) {
        out.push(
          makeDecision(
            candidate,
            'SELL',
            `stop loss hit (${profitRate.times(100).toFixed(2)}%)`,
            dryRun,
          ),
        );
        continue;
      }

      if (profitRate.gte(new Big(TRADING_CONFIG.takeProfitPct))) {
        out.push(
          makeDecision(
            candidate,
            'SELL',
            `take profit hit (${profitRate.times(100).toFixed(2)}%)`,
            dryRun,
          ),
        );
        continue;
      }
    }

    // 3) 매수 규칙
    if (candidate.aiDecision === 'ALLOW' && score >= 0.7 && !candidate.hasPosition) {
      out.push(makeDecision(candidate, 'BUY', 'ALLOW recommendation with score >= 0.7', dryRun));
      continue;
    }

    out.push(makeDecision(candidate, 'SKIP', candidate.reason, dryRun));
  }

  return out;
}
