import Big from 'big.js';
import type { Strategy, StrategySignal, Candle, Position } from '../types.js';

/**
 * Bollinger Band Squeeze 전략 (John Carter 방식)
 *
 * 원리:
 *  - Bollinger Band(20, 2.0)가 Keltner Channel(20, ATR×1.5) 안으로 수축 → Squeeze ON
 *  - Squeeze가 해제(BB가 KC 밖으로 확장)될 때 방향성 포착
 *  - 상방 돌파(close > BB 상단) → BUY
 *  - 손절: ATR(14) × atrStopMultiplier 또는 종가 < BB 하단
 *
 * 적합 종목:
 *  - 고변동성 성장주 (NVDA, TSLA 등)
 *  - 박스권 → 폭발적 상승/하락 패턴 종목
 */
export class BBSqueezeStrategy implements Strategy {
  name = 'BB Squeeze (Keltner + ATR Stop)';
  params: {
    bbPeriod: number;
    bbStdDev: number;
    keltnerPeriod: number;
    keltnerMultiplier: number;
    atrPeriod: number;
    atrStopMultiplier: number;
  };

  // 이전 봉 squeeze 상태 (상태 보존)
  private prevSqueeze: boolean = false;
  private entryAtr: Big | null = null;

  constructor(params?: {
    bbPeriod?: number;
    bbStdDev?: number;
    keltnerPeriod?: number;
    keltnerMultiplier?: number;
    atrPeriod?: number;
    atrStopMultiplier?: number;
  }) {
    this.params = {
      bbPeriod: params?.bbPeriod ?? 20,
      bbStdDev: params?.bbStdDev ?? 2.0,
      keltnerPeriod: params?.keltnerPeriod ?? 20,
      keltnerMultiplier: params?.keltnerMultiplier ?? 1.5,
      atrPeriod: params?.atrPeriod ?? 14,
      atrStopMultiplier: params?.atrStopMultiplier ?? 2.0,
    };
  }

  generateSignal(candles: Candle[], position: Position | null): StrategySignal {
    const { bbPeriod, bbStdDev, keltnerPeriod, keltnerMultiplier, atrPeriod, atrStopMultiplier } =
      this.params;

    // 최소 캔들 수 확인
    const minCandles = Math.max(bbPeriod, keltnerPeriod, atrPeriod) + 2;
    if (candles.length < minCandles) {
      return { action: 'HOLD' };
    }

    const currentClose = candles[candles.length - 1]!.close;

    // ── 1. ATR 손절매 체크 ─────────────────────────────────────────────────
    if (position && this.entryAtr !== null) {
      const stopLossPrice = position.avgPrice.minus(this.entryAtr.times(atrStopMultiplier));
      if (currentClose.lt(stopLossPrice)) {
        this.entryAtr = null;
        this.prevSqueeze = false;
        return {
          action: 'SELL',
          reason: `ATR 손절매 (기준가: ${stopLossPrice.toFixed(4)}, 현재가: ${currentClose.toFixed(4)})`,
        };
      }
    }

    // ── 2. 현재 봉 BB + KC 계산 ─────────────────────────────────────────────
    const { upper: bbUpper, lower: bbLower } = this.calculateBB(
      candles,
      bbPeriod,
      bbStdDev,
    );
    const { upper: kcUpper, lower: kcLower } = this.calculateKC(
      candles,
      keltnerPeriod,
      keltnerMultiplier,
      atrPeriod,
    );

    // Squeeze = BB가 KC 안에 있는 상태
    const currentSqueeze = bbUpper.lt(kcUpper) && bbLower.gt(kcLower);

    // ── 3. BB 하단 이탈 청산 (포지션 보유 중) ──────────────────────────────
    if (position && currentClose.lt(bbLower)) {
      this.entryAtr = null;
      this.prevSqueeze = currentSqueeze;
      return {
        action: 'SELL',
        reason: `BB 하단 이탈 (BB 하단: ${bbLower.toFixed(4)}, 현재가: ${currentClose.toFixed(4)})`,
      };
    }

    // ── 4. Squeeze 해제 + 상방 돌파 → BUY ──────────────────────────────────
    if (
      this.prevSqueeze && // 이전 봉: squeeze 중
      !currentSqueeze && // 현재 봉: squeeze 해제 (BB 확장)
      currentClose.gt(bbUpper) && // 상방 돌파
      !position
    ) {
      const atr = this.calculateATR(candles, atrPeriod);
      this.entryAtr = atr;
      this.prevSqueeze = currentSqueeze;
      return {
        action: 'BUY',
        reason: `BB Squeeze 상방 돌파 (BB 상단: ${bbUpper.toFixed(4)}, KC 상단: ${kcUpper.toFixed(4)}, ATR 손절: ${currentClose.minus(atr.times(atrStopMultiplier)).toFixed(4)})`,
      };
    }

    this.prevSqueeze = currentSqueeze;
    return { action: 'HOLD' };
  }

  /**
   * Bollinger Band 계산
   * upper = MA(period) + stdDev × std(close, period)
   * lower = MA(period) - stdDev × std(close, period)
   */
  private calculateBB(
    candles: Candle[],
    period: number,
    stdDevMultiplier: number,
  ): { upper: Big; lower: Big; middle: Big } {
    const recent = candles.slice(-period);
    const closes = recent.map((c) => c.close);

    // 평균 계산
    const sum = closes.reduce((acc, c) => acc.plus(c), new Big(0));
    const mean = sum.div(period);

    // 분산 계산: Σ(x - μ)² / N
    const variance = closes
      .reduce((acc, c) => acc.plus(c.minus(mean).pow(2)), new Big(0))
      .div(period);

    // 표준편차: sqrt(variance) — big.js sqrt() 활용
    const std = variance.sqrt();

    const band = std.times(stdDevMultiplier);
    return {
      upper: mean.plus(band),
      lower: mean.minus(band),
      middle: mean,
    };
  }

  /**
   * Keltner Channel 계산
   * upper = EMA(period) + multiplier × ATR(atrPeriod)
   * lower = EMA(period) - multiplier × ATR(atrPeriod)
   * (EMA 대신 SMA 사용 — 단순화)
   */
  private calculateKC(
    candles: Candle[],
    period: number,
    multiplier: number,
    atrPeriod: number,
  ): { upper: Big; lower: Big; middle: Big } {
    const recent = candles.slice(-period);
    const sum = recent.reduce((acc, c) => acc.plus(c.close), new Big(0));
    const middle = sum.div(period);

    const atr = this.calculateATR(candles, atrPeriod);
    const band = atr.times(multiplier);

    return {
      upper: middle.plus(band),
      lower: middle.minus(band),
      middle,
    };
  }

  /**
   * ATR (Average True Range) 계산
   */
  private calculateATR(candles: Candle[], period: number): Big {
    if (candles.length < period + 1) {
      const recent = candles.slice(-period);
      const sum = recent.reduce((acc, c) => acc.plus(c.high.minus(c.low)), new Big(0));
      return sum.div(recent.length);
    }

    const recent = candles.slice(-(period + 1));
    let trSum = new Big(0);

    for (let i = 1; i < recent.length; i++) {
      const cur = recent[i]!;
      const prev = recent[i - 1]!;

      const hl = cur.high.minus(cur.low);
      const hc = cur.high.minus(prev.close).abs();
      const lc = cur.low.minus(prev.close).abs();

      const tr = hl.gt(hc) ? (hl.gt(lc) ? hl : lc) : hc.gt(lc) ? hc : lc;
      trSum = trSum.plus(tr);
    }

    return trSum.div(period);
  }
}
