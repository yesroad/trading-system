import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { calculateSlippage, applySlippage } from './slippage.js';

describe('슬리피지 모델', () => {
  describe('calculateSlippage', () => {
    it('Fixed 모델: 고정 비율 반환', () => {
      const slippage = calculateSlippage({
        model: 'fixed',
        orderSize: new Big(1000000),
        avgVolume: new Big(10000000),
        bidAskSpread: new Big(0.1),
        fixedPct: 0.05,
      });

      expect(slippage.toNumber()).toBe(0.05);
    });

    it('Linear 모델: 주문 크기에 비례', () => {
      const slippage = calculateSlippage({
        model: 'linear',
        orderSize: new Big(1000000), // 주문 크기
        avgVolume: new Big(10000000), // 평균 거래량
        bidAskSpread: new Big(0.1), // 스프레드 0.1%
      });

      // (1M / 10M) × 0.1% = 0.01%
      expect(slippage.toNumber()).toBeCloseTo(0.01, 4);
    });

    it('Square Root 모델: 시장 충격', () => {
      const slippage = calculateSlippage({
        model: 'sqrt',
        orderSize: new Big(1000000),
        avgVolume: new Big(10000000),
        bidAskSpread: new Big(0.1),
      });

      // sqrt(1M / 10M) × 0.1% = sqrt(0.1) × 0.1% ≈ 0.0316%
      expect(slippage.toNumber()).toBeCloseTo(0.0316, 3);
    });

    it('거래량 0일 때 슬리피지 0', () => {
      const slippage = calculateSlippage({
        model: 'linear',
        orderSize: new Big(1000000),
        avgVolume: new Big(0),
        bidAskSpread: new Big(0.1),
      });

      expect(slippage.toNumber()).toBe(0);
    });
  });

  describe('applySlippage', () => {
    it('매수: 가격 상승 (불리)', () => {
      const price = new Big(100000);
      const slippagePct = new Big(0.1); // 0.1%

      const executionPrice = applySlippage(price, slippagePct, 'BUY');

      // 100,000 × 1.001 = 100,100
      expect(executionPrice.toNumber()).toBeCloseTo(100100, 0);
    });

    it('매도: 가격 하락 (불리)', () => {
      const price = new Big(100000);
      const slippagePct = new Big(0.1); // 0.1%

      const executionPrice = applySlippage(price, slippagePct, 'SELL');

      // 100,000 × 0.999 = 99,900
      expect(executionPrice.toNumber()).toBeCloseTo(99900, 0);
    });
  });
});
