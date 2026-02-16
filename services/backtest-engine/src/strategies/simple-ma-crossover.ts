import Big from 'big.js';
import type { Strategy, StrategySignal, Candle, Position } from '../types.js';

/**
 * Simple Moving Average Crossover 전략
 *
 * 골든 크로스 (단기 이평선 > 장기 이평선) → 매수
 * 데드 크로스 (단기 이평선 < 장기 이평선) → 매도
 */
export class SimpleMAStrategy implements Strategy {
  name = 'Simple MA Crossover';
  params: {
    shortPeriod: number;
    longPeriod: number;
  };

  constructor(params?: { shortPeriod?: number; longPeriod?: number }) {
    this.params = {
      shortPeriod: params?.shortPeriod ?? 10,
      longPeriod: params?.longPeriod ?? 20,
    };
  }

  generateSignal(candles: Candle[], position: Position | null): StrategySignal {
    // 충분한 캔들이 없으면 HOLD
    if (candles.length < this.params.longPeriod) {
      return { action: 'HOLD' };
    }

    // 단기 이평선 계산
    const shortMA = this.calculateMA(candles, this.params.shortPeriod);

    // 장기 이평선 계산
    const longMA = this.calculateMA(candles, this.params.longPeriod);

    // 이전 이평선 계산 (크로스오버 확인용)
    const prevCandles = candles.slice(0, -1);
    const prevShortMA =
      prevCandles.length >= this.params.shortPeriod
        ? this.calculateMA(prevCandles, this.params.shortPeriod)
        : null;
    const prevLongMA =
      prevCandles.length >= this.params.longPeriod
        ? this.calculateMA(prevCandles, this.params.longPeriod)
        : null;

    // 골든 크로스 확인 (매수 신호)
    if (
      prevShortMA &&
      prevLongMA &&
      prevShortMA.lte(prevLongMA) &&
      shortMA.gt(longMA) &&
      !position
    ) {
      return {
        action: 'BUY',
        reason: `골든 크로스 (단기 MA: ${shortMA.toFixed(2)}, 장기 MA: ${longMA.toFixed(2)})`,
      };
    }

    // 데드 크로스 확인 (매도 신호)
    if (
      prevShortMA &&
      prevLongMA &&
      prevShortMA.gte(prevLongMA) &&
      shortMA.lt(longMA) &&
      position
    ) {
      return {
        action: 'SELL',
        reason: `데드 크로스 (단기 MA: ${shortMA.toFixed(2)}, 장기 MA: ${longMA.toFixed(2)})`,
      };
    }

    return { action: 'HOLD' };
  }

  /**
   * Simple Moving Average 계산
   */
  private calculateMA(candles: Candle[], period: number): Big {
    if (candles.length < period) {
      throw new Error(`캔들 수가 부족합니다. 필요: ${period}, 현재: ${candles.length}`);
    }

    const recentCandles = candles.slice(-period);
    const sum = recentCandles.reduce((acc, candle) => acc.plus(candle.close), new Big(0));

    return sum.div(period);
  }
}
