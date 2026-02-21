import type Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import {
  analyzeTechnicalIndicators,
  type Market as TradingMarket,
  type TechnicalSnapshot,
} from '@workspace/trading-utils';
import type { Market } from '../config/markets.js';
import type { SelectedTarget, TargetTechnicalContext } from './selectTargets.js';

const logger = createLogger('target-technical-enricher');

type TechnicalEnrichmentSummary = {
  requested: number;
  attempted: number;
  enriched: number;
  failed: number;
  skippedByLimit: number;
};

export type TechnicalEnrichmentResult = {
  targets: SelectedTarget[];
  technicalBySymbol: Record<string, TargetTechnicalContext>;
  summary: TechnicalEnrichmentSummary;
};

function toNumber(value: Big | null, digits = 4): number | null {
  if (!value) return null;
  const fixed = value.toFixed(digits);
  const parsed = Number(fixed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPct(current: Big, base: Big | null, digits = 4): number | null {
  if (!base || base.eq(0)) return null;
  const pct = current.minus(base).div(base).times(100);
  const parsed = Number(pct.toFixed(digits));
  return Number.isFinite(parsed) ? parsed : null;
}

function countAvailableIndicators(snapshot: TechnicalSnapshot): number {
  let count = 0;
  if (snapshot.ema20) count += 1;
  if (snapshot.sma20) count += 1;
  if (snapshot.macd) count += 1;
  if (snapshot.rsi) count += 1;
  if (snapshot.volume) count += 1;
  if (snapshot.atr) count += 1;
  return count;
}

function evaluateTrendBias(params: {
  priceVsEma20Pct: number | null;
  macdHistogram: number | null;
  rsi: number | null;
  volumeRatio: number | null;
}): {
  trendBias: TargetTechnicalContext['trendBias'];
  reasons: string[];
  summary: string;
} {
  const reasons: string[] = [];
  let bullish = 0;
  let bearish = 0;

  if (params.priceVsEma20Pct !== null) {
    if (params.priceVsEma20Pct > 0.15) bullish += 1;
    if (params.priceVsEma20Pct < -0.15) bearish += 1;
    reasons.push(`EMA20 대비 ${params.priceVsEma20Pct.toFixed(2)}%`);
  }

  if (params.macdHistogram !== null) {
    if (params.macdHistogram > 0) bullish += 1;
    if (params.macdHistogram < 0) bearish += 1;
    reasons.push(`MACD 히스토그램 ${params.macdHistogram.toFixed(4)}`);
  }

  if (params.rsi !== null) {
    if (params.rsi >= 55 && params.rsi <= 75) bullish += 1;
    if (params.rsi >= 25 && params.rsi <= 45) bearish += 1;
    if (params.rsi > 80) bearish += 1;
    if (params.rsi < 20) bullish += 1;
    reasons.push(`RSI ${params.rsi.toFixed(2)}`);
  }

  if (params.volumeRatio !== null) {
    if (params.volumeRatio >= 1.2) {
      if (bullish > bearish) bullish += 1;
      if (bearish > bullish) bearish += 1;
    }
    reasons.push(`거래량 비율 ${params.volumeRatio.toFixed(2)}x`);
  }

  if (bullish - bearish >= 2) {
    return {
      trendBias: 'BUY_BIAS',
      reasons,
      summary: '상승 모멘텀 우세',
    };
  }

  if (bearish - bullish >= 2) {
    return {
      trendBias: 'SELL_BIAS',
      reasons,
      summary: '하락 모멘텀 우세',
    };
  }

  return {
    trendBias: 'NEUTRAL',
    reasons,
    summary: '방향성 혼조',
  };
}

function resolveQuality(snapshot: TechnicalSnapshot): TargetTechnicalContext['quality'] {
  const available = countAvailableIndicators(snapshot);
  if (available >= 5) return 'HIGH';
  if (available >= 3) return 'MEDIUM';
  return 'LOW';
}

function buildTechnicalContext(snapshot: TechnicalSnapshot): TargetTechnicalContext {
  const currentPrice = Number(snapshot.currentPrice.toString());
  const rsi = toNumber(snapshot.rsi?.value ?? null, 2);
  const macdHistogram = toNumber(snapshot.macd?.histogram ?? null, 6);
  const volumeRatio = toNumber(snapshot.volume?.volumeRatio ?? null, 3);
  const priceVsEma20Pct = toPct(snapshot.currentPrice, snapshot.ema20, 3);
  const priceVsSma20Pct = toPct(snapshot.currentPrice, snapshot.sma20, 3);
  const atrPct =
    snapshot.atr && !snapshot.currentPrice.eq(0)
      ? toPct(snapshot.atr, snapshot.currentPrice, 3)
      : null;
  const trend = evaluateTrendBias({
    priceVsEma20Pct,
    macdHistogram,
    rsi,
    volumeRatio,
  });

  return {
    trendBias: trend.trendBias,
    quality: resolveQuality(snapshot),
    currentPrice,
    rsi,
    macdHistogram,
    volumeRatio,
    priceVsEma20Pct,
    priceVsSma20Pct,
    atrPct,
    calculatedAt: snapshot.calculatedAt,
    reasons: trend.reasons,
    summary: trend.summary,
  };
}

function toTradingMarket(market: Market): TradingMarket {
  return market as TradingMarket;
}

export async function enrichTargetsWithTechnical(params: {
  market: Market;
  targets: SelectedTarget[];
  limit: number;
}): Promise<TechnicalEnrichmentResult> {
  const uniqueSymbols = Array.from(
    new Set(
      params.targets
        .map((target) => target.symbol?.trim())
        .filter((symbol): symbol is string => typeof symbol === 'string' && symbol.length > 0),
    ),
  );
  const safeLimit = Math.max(0, params.limit);
  const symbolsToAnalyze = uniqueSymbols.slice(0, safeLimit);
  const technicalBySymbol: Record<string, TargetTechnicalContext> = {};
  let failed = 0;

  for (const symbol of symbolsToAnalyze) {
    try {
      const snapshot = await analyzeTechnicalIndicators({
        market: toTradingMarket(params.market),
        symbol,
      });
      technicalBySymbol[symbol] = buildTechnicalContext(snapshot);
    } catch (error: unknown) {
      failed += 1;
      logger.warn('타겟 기술지표 컨텍스트 수집 실패', {
        market: params.market,
        symbol,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const enrichedTargets = params.targets.map((target) => {
    const technical = technicalBySymbol[target.symbol];
    if (!technical) return target;
    return {
      ...target,
      technical,
    };
  });

  return {
    targets: enrichedTargets,
    technicalBySymbol,
    summary: {
      requested: params.targets.length,
      attempted: symbolsToAnalyze.length,
      enriched: Object.keys(technicalBySymbol).length,
      failed,
      skippedByLimit: Math.max(0, uniqueSymbols.length - symbolsToAnalyze.length),
    },
  };
}
