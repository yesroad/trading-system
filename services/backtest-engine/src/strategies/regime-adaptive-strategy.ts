import type { Strategy, StrategySignal, Candle, Position } from '../types.js';
import { RegimeDetector, type MarketRegime } from '../models/regime-detector.js';
import { EnhancedMAStrategy } from './enhanced-ma-strategy.js';
import { BBSqueezeStrategy } from './bb-squeeze-strategy.js';

/**
 * Regime-Adaptive Strategy
 *
 * 시장 국면을 자동 감지하여 적합한 전략을 선택:
 * - TRENDING_UP: Enhanced MA (추세 추종)
 * - TRENDING_DOWN: HOLD (거래 중단)
 * - SIDEWAYS: BB Squeeze (변동성 돌파)
 * - WEAK_TREND: BB Squeeze (불명확 추세)
 */
export class RegimeAdaptiveStrategy implements Strategy {
  name = 'Regime-Adaptive (Auto Strategy Selection)';
  params: {
    // Regime Detector 설정
    sma50Period: number;
    sma200Period: number;
    adxPeriod: number;
    // Enhanced MA 설정
    enhancedMa: {
      shortPeriod: number;
      longPeriod: number;
      atrMultiplier: number;
      slopePeriod: number;
      use200MaFilter: boolean;
      ma200Period: number;
    };
    // BB Squeeze 설정
    bbSqueeze: {
      bbPeriod: number;
      bbStdDev: number;
      keltnerMultiplier: number;
      atrStopMultiplier: number;
    };
  };

  private regimeDetector: RegimeDetector;
  private enhancedMaStrategy: EnhancedMAStrategy;
  private bbSqueezeStrategy: BBSqueezeStrategy;
  private currentRegime: MarketRegime = 'SIDEWAYS';
  private currentStrategy: 'enhanced-ma' | 'bb-squeeze' | 'none' = 'none';

  constructor(params?: {
    sma50Period?: number;
    sma200Period?: number;
    adxPeriod?: number;
    enhancedMa?: {
      shortPeriod?: number;
      longPeriod?: number;
      atrMultiplier?: number;
      slopePeriod?: number;
      use200MaFilter?: boolean;
      ma200Period?: number;
    };
    bbSqueeze?: {
      bbPeriod?: number;
      bbStdDev?: number;
      keltnerMultiplier?: number;
      atrStopMultiplier?: number;
    };
  }) {
    this.params = {
      sma50Period: params?.sma50Period ?? 50,
      sma200Period: params?.sma200Period ?? 200,
      adxPeriod: params?.adxPeriod ?? 14,
      enhancedMa: {
        shortPeriod: params?.enhancedMa?.shortPeriod ?? 10,
        longPeriod: params?.enhancedMa?.longPeriod ?? 20,
        atrMultiplier: params?.enhancedMa?.atrMultiplier ?? 2.0,
        slopePeriod: params?.enhancedMa?.slopePeriod ?? 5,
        use200MaFilter: params?.enhancedMa?.use200MaFilter ?? false,
        ma200Period: params?.enhancedMa?.ma200Period ?? 200,
      },
      bbSqueeze: {
        bbPeriod: params?.bbSqueeze?.bbPeriod ?? 20,
        bbStdDev: params?.bbSqueeze?.bbStdDev ?? 2.0,
        keltnerMultiplier: params?.bbSqueeze?.keltnerMultiplier ?? 1.5,
        atrStopMultiplier: params?.bbSqueeze?.atrStopMultiplier ?? 2.0,
      },
    };

    // Regime Detector 생성
    this.regimeDetector = new RegimeDetector({
      sma50Period: this.params.sma50Period,
      sma200Period: this.params.sma200Period,
      adxPeriod: this.params.adxPeriod,
    });

    // 하위 전략 생성
    this.enhancedMaStrategy = new EnhancedMAStrategy(this.params.enhancedMa);
    this.bbSqueezeStrategy = new BBSqueezeStrategy({
      bbPeriod: this.params.bbSqueeze.bbPeriod,
      bbStdDev: this.params.bbSqueeze.bbStdDev,
      keltnerPeriod: this.params.bbSqueeze.bbPeriod,
      keltnerMultiplier: this.params.bbSqueeze.keltnerMultiplier,
      atrStopMultiplier: this.params.bbSqueeze.atrStopMultiplier,
    });
  }

  generateSignal(candles: Candle[], position: Position | null): StrategySignal {
    // 1. 시장 국면 감지
    const regimeResult = this.regimeDetector.detectRegime(candles);
    this.currentRegime = regimeResult.regime;

    // 2. 국면별 전략 선택
    let selectedStrategy: Strategy | null = null;
    let strategyName = 'none';

    switch (this.currentRegime) {
      case 'TRENDING_UP':
        selectedStrategy = this.enhancedMaStrategy;
        strategyName = 'enhanced-ma';
        break;

      case 'TRENDING_DOWN':
        // 하락 추세 → 무조건 현금 (신규 진입 차단 + 기존 포지션 즉시 청산)
        this.currentStrategy = 'none';
        if (position) {
          return {
            action: 'SELL',
            reason: `국면: TRENDING_DOWN (하락 추세) → 현금 강제 청산`,
          };
        }
        return {
          action: 'HOLD',
          reason: `국면: TRENDING_DOWN (하락 추세) → 신규 진입 차단`,
        };

      case 'SIDEWAYS':
      case 'WEAK_TREND':
        selectedStrategy = this.bbSqueezeStrategy;
        strategyName = 'bb-squeeze';
        break;
    }

    this.currentStrategy = strategyName as 'enhanced-ma' | 'bb-squeeze' | 'none';

    if (!selectedStrategy) {
      return { action: 'HOLD', reason: 'No strategy selected' };
    }

    // 3. 선택된 전략의 신호 생성
    const signal = selectedStrategy.generateSignal(candles, position);

    // 4. 신호에 국면 정보 추가
    if (signal.reason) {
      signal.reason = `[${this.currentRegime}] ${signal.reason}`;
    } else {
      signal.reason = `국면: ${this.currentRegime}, 전략: ${strategyName}`;
    }

    return signal;
  }

  /**
   * 현재 활성 국면 조회
   */
  getCurrentRegime(): MarketRegime {
    return this.currentRegime;
  }

  /**
   * 현재 활성 전략 조회
   */
  getCurrentStrategy(): string {
    return this.currentStrategy;
  }
}
