import Big from 'big.js';
import type { Strategy, StrategySignal, Candle, Position } from '../types.js';

/**
 * Enhanced MA Crossover 전략
 *
 * Simple MA Crossover에 5가지 리스크 엔지니어링 추가:
 *  1. ATR 기반 손절매 (entryPrice - ATR(14) × atrMultiplier)
 *  2. 포지션 크기 축소: config.maxPositionSize로 제어 (CLI에서 0.55 전달)
 *  3. 시장 필터: 장기 MA 기울기가 양수일 때만 매수 진입
 *  4. [옵션] 200일 MA 레짐 필터: 가격 > 200일선일 때만 Long 허용
 *  5. [옵션] ADX(14) > 임계값일 때만 진입 (횡보장 차단)
 */
export class EnhancedMAStrategy implements Strategy {
  name = 'Enhanced MA (ATR Stop + Size + Filter)';
  params: {
    shortPeriod: number;
    longPeriod: number;
    atrPeriod: number;
    atrMultiplier: number;
    slopePeriod: number;
    use200MaFilter: boolean;
    ma200Period: number;
    useAdxFilter: boolean;
    adxPeriod: number;
    adxThreshold: number;
  };

  // 진입 시 저장되는 ATR (손절 계산용)
  private entryAtr: Big | null = null;

  constructor(params?: {
    shortPeriod?: number;
    longPeriod?: number;
    atrPeriod?: number;
    atrMultiplier?: number;
    slopePeriod?: number;
    use200MaFilter?: boolean;
    ma200Period?: number;
    useAdxFilter?: boolean;
    adxPeriod?: number;
    adxThreshold?: number;
  }) {
    this.params = {
      shortPeriod: params?.shortPeriod ?? 10,
      longPeriod: params?.longPeriod ?? 20,
      atrPeriod: params?.atrPeriod ?? 14,
      atrMultiplier: params?.atrMultiplier ?? 2.0,
      slopePeriod: params?.slopePeriod ?? 5,
      use200MaFilter: params?.use200MaFilter ?? false,
      ma200Period: params?.ma200Period ?? 200,
      useAdxFilter: params?.useAdxFilter ?? false,
      adxPeriod: params?.adxPeriod ?? 14,
      adxThreshold: params?.adxThreshold ?? 20,
    };

    // 필터 활성화 시 전략명 업데이트
    const filters: string[] = [];
    if (this.params.use200MaFilter) filters.push('200MA');
    if (this.params.useAdxFilter) filters.push(`ADX>${this.params.adxThreshold}`);
    if (filters.length > 0) {
      this.name = `Enhanced MA (ATR Stop + Size + Filter + ${filters.join(' + ')})`;
    }
  }

  generateSignal(candles: Candle[], position: Position | null): StrategySignal {
    const {
      shortPeriod,
      longPeriod,
      atrPeriod,
      atrMultiplier,
      slopePeriod,
      use200MaFilter,
      ma200Period,
      useAdxFilter,
      adxPeriod,
      adxThreshold,
    } = this.params;

    // 최소 캔들 수 확인
    // 200MA 필터는 소프트 제약 (데이터 부족 시 필터 비활성화, 거래는 허용)
    // ADX 필터만 엄격한 최소 캔들 수 요구
    const minCandles = Math.max(
      longPeriod + slopePeriod,
      atrPeriod + 1,
      useAdxFilter ? adxPeriod * 2 + 1 : 0,
    );
    if (candles.length < minCandles) {
      return { action: 'HOLD' };
    }

    const currentClose = candles[candles.length - 1]!.close;

    // ── 1. ATR 손절매 체크 (포지션 보유 중) ──────────────────────────────
    if (position && this.entryAtr !== null) {
      const stopLossPrice = position.avgPrice.minus(this.entryAtr.times(atrMultiplier));
      if (currentClose.lt(stopLossPrice)) {
        this.entryAtr = null;
        return {
          action: 'SELL',
          reason: `ATR 손절매 (기준가: ${stopLossPrice.toFixed(0)}원, 현재가: ${currentClose.toFixed(0)}원)`,
        };
      }
    }

    // ── 2. 이평선 계산 ────────────────────────────────────────────────────
    const shortMA = this.calculateMA(candles, shortPeriod);
    const longMA = this.calculateMA(candles, longPeriod);

    const prevCandles = candles.slice(0, -1);
    const prevShortMA =
      prevCandles.length >= shortPeriod ? this.calculateMA(prevCandles, shortPeriod) : null;
    const prevLongMA =
      prevCandles.length >= longPeriod ? this.calculateMA(prevCandles, longPeriod) : null;

    // ── 3. 시장 필터: 장기 MA 기울기 ──────────────────────────────────────
    const slopeCandles = candles.slice(0, -slopePeriod);
    const longMASlope =
      slopeCandles.length >= longPeriod
        ? longMA.minus(this.calculateMA(slopeCandles, longPeriod))
        : null;

    const isTrending = longMASlope !== null && longMASlope.gt(0);

    // ── 4. [옵션] 200일 MA 레짐 필터 ──────────────────────────────────────
    let above200Ma = true;
    if (use200MaFilter && candles.length >= ma200Period) {
      const ma200 = this.calculateMA(candles, ma200Period);
      above200Ma = currentClose.gt(ma200);
    }

    // ── 5. [옵션] ADX 필터 (추세 강도 확인) ──────────────────────────────
    let adxStrong = true;
    if (useAdxFilter && candles.length >= adxPeriod * 2 + 1) {
      const adx = this.calculateADX(candles, adxPeriod);
      adxStrong = adx.gt(adxThreshold);
    }

    // ── 6. 골든 크로스 매수 ───────────────────────────────────────────────
    if (
      prevShortMA &&
      prevLongMA &&
      prevShortMA.lte(prevLongMA) &&
      shortMA.gt(longMA) &&
      !position &&
      isTrending &&
      above200Ma &&
      adxStrong
    ) {
      const atr = this.calculateATR(candles, atrPeriod);
      this.entryAtr = atr;

      const filterInfo = [
        use200MaFilter
          ? `200MA: ${this.calculateMA(candles, ma200Period).toFixed(0)}`
          : null,
        useAdxFilter && candles.length >= adxPeriod * 2 + 1
          ? `ADX: ${this.calculateADX(candles, adxPeriod).toFixed(1)}`
          : null,
      ]
        .filter(Boolean)
        .join(', ');

      return {
        action: 'BUY',
        reason: `골든 크로스 + 상승 추세 (단기MA: ${shortMA.toFixed(0)}, 장기MA: ${longMA.toFixed(0)}, ATR 손절: ${currentClose.minus(atr.times(atrMultiplier)).toFixed(0)}원${filterInfo ? `, ${filterInfo}` : ''})`,
      };
    }

    // ── 7. 데드 크로스 매도 ───────────────────────────────────────────────
    if (
      prevShortMA &&
      prevLongMA &&
      prevShortMA.gte(prevLongMA) &&
      shortMA.lt(longMA) &&
      position
    ) {
      this.entryAtr = null;
      return {
        action: 'SELL',
        reason: `데드 크로스 (단기MA: ${shortMA.toFixed(0)}, 장기MA: ${longMA.toFixed(0)})`,
      };
    }

    return { action: 'HOLD' };
  }

  /**
   * Simple Moving Average 계산
   */
  private calculateMA(candles: Candle[], period: number): Big {
    const recent = candles.slice(-period);
    const sum = recent.reduce((acc, c) => acc.plus(c.close), new Big(0));
    return sum.div(period);
  }

  /**
   * ATR (Average True Range) 계산
   *
   * True Range = max(high-low, |high-prevClose|, |low-prevClose|)
   * ATR = SMA(TR, period)
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

  /**
   * ADX (Average Directional Index) 계산
   *
   * 1. +DM = max(high - prevHigh, 0), -DM = max(prevLow - low, 0)
   *    (단, +DM > -DM일 때만 +DM 유효, -DM > +DM일 때만 -DM 유효)
   * 2. TR = max(|high-low|, |high-prevClose|, |low-prevClose|)
   * 3. SMA(+DM14), SMA(-DM14), SMA(TR14) 계산
   * 4. +DI = 100 × S(+DM) / S(ATR), -DI = 100 × S(-DM) / S(ATR)
   * 5. DX = |+DI - -DI| / (+DI + -DI) × 100
   * 6. ADX = SMA(DX, period)
   */
  private calculateADX(candles: Candle[], period: number): Big {
    if (candles.length < period * 2 + 1) {
      return new Big(0);
    }

    const recent = candles.slice(-(period * 2 + 1));
    const dxValues: Big[] = [];

    // period개의 DX 계산을 위해 period+1 ~ period*2 번째까지 슬라이딩
    for (let end = period + 1; end <= recent.length; end++) {
      const window = recent.slice(end - period - 1, end);

      let plusDmSum = new Big(0);
      let minusDmSum = new Big(0);
      let trSum = new Big(0);

      for (let i = 1; i < window.length; i++) {
        const cur = window[i]!;
        const prev = window[i - 1]!;

        const upMove = cur.high.minus(prev.high);
        const downMove = prev.low.minus(cur.low);

        const plusDm =
          upMove.gt(downMove) && upMove.gt(0) ? upMove : new Big(0);
        const minusDm =
          downMove.gt(upMove) && downMove.gt(0) ? downMove : new Big(0);

        const hl = cur.high.minus(cur.low);
        const hc = cur.high.minus(prev.close).abs();
        const lc = cur.low.minus(prev.close).abs();
        const tr = hl.gt(hc) ? (hl.gt(lc) ? hl : lc) : hc.gt(lc) ? hc : lc;

        plusDmSum = plusDmSum.plus(plusDm);
        minusDmSum = minusDmSum.plus(minusDm);
        trSum = trSum.plus(tr);
      }

      if (trSum.eq(0)) {
        dxValues.push(new Big(0));
        continue;
      }

      const plusDI = plusDmSum.div(trSum).times(100);
      const minusDI = minusDmSum.div(trSum).times(100);
      const diSum = plusDI.plus(minusDI);

      if (diSum.eq(0)) {
        dxValues.push(new Big(0));
        continue;
      }

      const dx = plusDI.minus(minusDI).abs().div(diSum).times(100);
      dxValues.push(dx);
    }

    if (dxValues.length === 0) return new Big(0);

    const adx = dxValues.reduce((acc, dx) => acc.plus(dx), new Big(0)).div(dxValues.length);
    return adx;
  }
}
