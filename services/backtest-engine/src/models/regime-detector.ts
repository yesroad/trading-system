import Big from 'big.js';
import type { Candle } from '../types.js';

/**
 * 시장 국면 (Market Regime)
 *
 * TRENDING_UP: 강한 상승 추세 (MA 상향, ADX > 25)
 * TRENDING_DOWN: 강한 하락 추세 (MA 하향, ADX > 25)
 * SIDEWAYS: 횡보/추세 없음 (ADX < 20)
 * WEAK_TREND: 약한 추세 (20 <= ADX <= 25)
 */
export type MarketRegime = 'TRENDING_UP' | 'TRENDING_DOWN' | 'SIDEWAYS' | 'WEAK_TREND';

export interface RegimeDetectionResult {
  regime: MarketRegime;
  confidence: number; // 0.0 ~ 1.0
  metrics: {
    adx: number;
    sma50: Big;
    sma200: Big;
    priceVsSma50: number; // % (양수: 위, 음수: 아래)
    priceVsSma200: number;
    slopeRatio: number; // SMA50 기울기 / SMA200 기울기
  };
}

/**
 * Market Regime Detector
 *
 * 원리:
 * 1. ADX로 추세 강도 측정 (>25: 강한 추세, <20: 횡보)
 * 2. SMA50/SMA200 교차 및 기울기로 방향 판단
 * 3. 현재 가격 위치로 확인
 */
export class RegimeDetector {
  private params: {
    sma50Period: number;
    sma200Period: number;
    adxPeriod: number;
    strongTrendThreshold: number; // ADX > 이 값 → 강한 추세
    sidewaysThreshold: number; // ADX < 이 값 → 횡보
  };

  constructor(params?: {
    sma50Period?: number;
    sma200Period?: number;
    adxPeriod?: number;
    strongTrendThreshold?: number;
    sidewaysThreshold?: number;
  }) {
    this.params = {
      sma50Period: params?.sma50Period ?? 50,
      sma200Period: params?.sma200Period ?? 200,
      adxPeriod: params?.adxPeriod ?? 14,
      strongTrendThreshold: params?.strongTrendThreshold ?? 25,
      sidewaysThreshold: params?.sidewaysThreshold ?? 20,
    };
  }

  /**
   * 시장 국면 감지
   */
  detectRegime(candles: Candle[]): RegimeDetectionResult {
    const { sma50Period, sma200Period, adxPeriod, strongTrendThreshold, sidewaysThreshold } =
      this.params;

    // 최소 캔들 수 확인
    const minCandles = Math.max(sma200Period, adxPeriod * 2 + 1);
    if (candles.length < minCandles) {
      return {
        regime: 'SIDEWAYS',
        confidence: 0,
        metrics: {
          adx: 0,
          sma50: new Big(0),
          sma200: new Big(0),
          priceVsSma50: 0,
          priceVsSma200: 0,
          slopeRatio: 0,
        },
      };
    }

    const currentClose = candles[candles.length - 1]!.close;

    // 1. ADX 계산
    const adx = this.calculateADX(candles, adxPeriod);

    // 2. SMA 계산
    const sma50 = this.calculateSMA(candles, sma50Period);
    const sma200 = this.calculateSMA(candles, sma200Period);

    // 3. 가격 위치 (%)
    const priceVsSma50 = currentClose.minus(sma50).div(sma50).times(100).toNumber();
    const priceVsSma200 = currentClose.minus(sma200).div(sma200).times(100).toNumber();

    // 4. SMA 기울기 (최근 20일 변화율)
    const slopeWindow = 20;
    const sma50Slope = this.calculateSlope(candles, sma50Period, slopeWindow);
    const sma200Slope = this.calculateSlope(candles, sma200Period, slopeWindow);
    const slopeRatio = sma200Slope !== 0 ? sma50Slope / sma200Slope : 0;

    // 5. 국면 판단
    let regime: MarketRegime;
    let confidence: number;

    if (adx < sidewaysThreshold) {
      // 횡보: ADX 낮음
      regime = 'SIDEWAYS';
      confidence = 1 - adx / sidewaysThreshold; // ADX 0에 가까울수록 confidence 높음
    } else if (adx > strongTrendThreshold) {
      // 강한 추세: ADX 높음 + 방향 판단
      if (priceVsSma50 > 0 && priceVsSma200 > 0 && sma50Slope > 0) {
        regime = 'TRENDING_UP';
        confidence = Math.min((adx - strongTrendThreshold) / 20 + 0.5, 1.0);
      } else if (priceVsSma50 < 0 && priceVsSma200 < 0 && sma50Slope < 0) {
        regime = 'TRENDING_DOWN';
        confidence = Math.min((adx - strongTrendThreshold) / 20 + 0.5, 1.0);
      } else {
        // 혼재 신호 (ADX 높지만 방향 불명확)
        regime = 'WEAK_TREND';
        confidence = 0.3;
      }
    } else {
      // 약한 추세: 20 <= ADX <= 25
      if (priceVsSma50 > 0 && sma50Slope > 0) {
        regime = 'TRENDING_UP';
        confidence = 0.4;
      } else if (priceVsSma50 < 0 && sma50Slope < 0) {
        regime = 'TRENDING_DOWN';
        confidence = 0.4;
      } else {
        regime = 'WEAK_TREND';
        confidence = 0.3;
      }
    }

    return {
      regime,
      confidence,
      metrics: {
        adx,
        sma50,
        sma200,
        priceVsSma50,
        priceVsSma200,
        slopeRatio,
      },
    };
  }

  /**
   * 국면별 권장 전략
   */
  getRecommendedStrategy(regime: MarketRegime): string {
    switch (regime) {
      case 'TRENDING_UP':
        return 'enhanced-ma'; // 추세 추종에 최적
      case 'TRENDING_DOWN':
        return 'none'; // 하락 추세에서는 거래 중단 권장
      case 'SIDEWAYS':
        return 'bb-squeeze'; // 횡보 후 돌파 포착
      case 'WEAK_TREND':
        return 'bb-squeeze'; // 불명확한 추세에서는 변동성 전략
      default:
        return 'enhanced-ma';
    }
  }

  // ===== Private Methods =====

  private calculateSMA(candles: Candle[], period: number): Big {
    const recent = candles.slice(-period);
    const sum = recent.reduce((acc, c) => acc.plus(c.close), new Big(0));
    return sum.div(period);
  }

  private calculateSlope(candles: Candle[], smaPeriod: number, slopeWindow: number): number {
    if (candles.length < smaPeriod + slopeWindow) return 0;

    const oldCandles = candles.slice(-(smaPeriod + slopeWindow), -slopeWindow);
    const recentCandles = candles.slice(-smaPeriod);

    const oldSma = this.calculateSMA(oldCandles, smaPeriod);
    const recentSma = this.calculateSMA(recentCandles, smaPeriod);

    // 변화율 (%)
    return recentSma.minus(oldSma).div(oldSma).times(100).toNumber();
  }

  private calculateADX(candles: Candle[], period: number): number {
    if (candles.length < period * 2 + 1) return 0;

    const recent = candles.slice(-(period * 2 + 1));

    // True Range 계산
    const trArray: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const cur = recent[i]!;
      const prev = recent[i - 1]!;

      const hl = cur.high.minus(cur.low).toNumber();
      const hc = Math.abs(cur.high.minus(prev.close).toNumber());
      const lc = Math.abs(cur.low.minus(prev.close).toNumber());

      trArray.push(Math.max(hl, hc, lc));
    }

    // +DM, -DM 계산
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const upMove = recent[i]!.high.minus(recent[i - 1]!.high).toNumber();
      const downMove = recent[i - 1]!.low.minus(recent[i]!.low).toNumber();

      plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smoothed values (Wilder's smoothing)
    const smoothTR = this.smoothArray(trArray, period);
    const smoothPlusDM = this.smoothArray(plusDM, period);
    const smoothMinusDM = this.smoothArray(minusDM, period);

    // +DI, -DI
    const plusDI = (smoothPlusDM / smoothTR) * 100;
    const minusDI = (smoothMinusDM / smoothTR) * 100;

    // DX
    const diSum = plusDI + minusDI;
    const dx = diSum === 0 ? 0 : (Math.abs(plusDI - minusDI) / diSum) * 100;

    // ADX (단순화: 최근 DX만 반환, 실제로는 DX의 smoothing 필요)
    return dx;
  }

  private smoothArray(arr: number[], period: number): number {
    if (arr.length < period) return 0;

    // Wilder's smoothing: 초기값은 단순 평균, 이후 평활
    const initial = arr.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    let smoothed = initial;

    for (let i = period; i < arr.length; i++) {
      smoothed = (smoothed * (period - 1) + arr[i]!) / period;
    }

    return smoothed;
  }
}
