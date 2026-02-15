import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  calculatePositionSize,
  calculateFixedValuePosition,
  calculateMultipleRiskSizes,
} from '../../risk/position-sizing.js';

describe('Position Sizing', () => {
  describe('calculatePositionSize', () => {
    it('정상: 1% 리스크로 포지션을 계산해야 함', () => {
      const result = calculatePositionSize({
        accountSize: new Big(10000000), // 1000만원
        riskPercentage: 0.01, // 1%
        entry: new Big(100000), // 진입가
        stopLoss: new Big(95000), // 손절가 (5% 손실)
      });

      // 리스크 금액 = 10,000,000 * 0.01 = 100,000원
      expect(result.riskAmount.toString()).toBe('100000');

      // 손절 거리 = 100000 - 95000 = 5000 (5%)
      // 포지션 가치 = 100,000 / 0.05 = 2,000,000원
      // 포지션 크기 = 2,000,000 / 100,000 = 20개
      expect(result.positionSize.toString()).toBe('20');
      expect(result.positionValue.toString()).toBe('2000000');

      // 최대 포지션 제한 안 걸림 (2,000,000 < 2,500,000)
      expect(result.limitedByMaxExposure).toBe(false);
    });

    it('정상: 2% 리스크는 1%보다 포지션이 2배 커야 함', () => {
      const params = {
        accountSize: new Big(10000000),
        entry: new Big(100000),
        stopLoss: new Big(90000), // 10% 손절 (제한 안 걸리도록)
      };

      const result1pct = calculatePositionSize({ ...params, riskPercentage: 0.01 });
      const result2pct = calculatePositionSize({ ...params, riskPercentage: 0.02 });

      // 둘 다 제한 안 걸려야 함
      expect(result1pct.limitedByMaxExposure).toBe(false);
      expect(result2pct.limitedByMaxExposure).toBe(false);

      const ratio = result2pct.positionSize.div(result1pct.positionSize);
      expect(ratio.toFixed(1)).toBe('2.0');
    });

    it('제한: 포지션 가치가 계좌의 25%를 초과하면 제한되어야 함', () => {
      const result = calculatePositionSize({
        accountSize: new Big(10000000), // 1000만원
        riskPercentage: 0.05, // 5% (큰 리스크)
        entry: new Big(100000),
        stopLoss: new Big(99000), // 1% 손절
      });

      // 5% 리스크 = 500,000원
      // 1% 손절이면 포지션 가치 = 50,000,000원 (계좌의 500%)
      // 하지만 최대 25% = 2,500,000원으로 제한되어야 함
      expect(result.limitedByMaxExposure).toBe(true);
      expect(result.positionValue.toString()).toBe('2500000');
      expect(result.maxPositionValue.toString()).toBe('2500000');

      // 제한된 포지션 크기 = 2,500,000 / 100,000 = 25개
      expect(result.positionSize.toString()).toBe('25');
    });

    it('경계: 손절가가 진입가와 같으면 에러 (0으로 나누기)', () => {
      // stopLossPct = 0이 되어 division by zero
      expect(() =>
        calculatePositionSize({
          accountSize: new Big(10000000),
          riskPercentage: 0.01,
          entry: new Big(100000),
          stopLoss: new Big(100000), // 진입가와 동일
        })
      ).toThrow();
    });

    it('정상: 손절가가 진입가보다 높아도 계산되어야 함 (SELL 포지션)', () => {
      const result = calculatePositionSize({
        accountSize: new Big(10000000),
        riskPercentage: 0.01,
        entry: new Big(100000),
        stopLoss: new Big(102000), // 진입가보다 높음
      });

      // abs()로 거리를 계산하므로 정상 동작
      expect(result.positionSize.gt(0)).toBe(true);
      expect(result.riskAmount.toString()).toBe('100000');
    });

    it('정상: 계좌 크기가 작아도 소수점 포지션이 계산되어야 함', () => {
      const result = calculatePositionSize({
        accountSize: new Big(1000000), // 100만원
        riskPercentage: 0.01, // 1% = 10,000원
        entry: new Big(100000), // 10만원/개
        stopLoss: new Big(98000), // 2% 손절
      });

      // 리스크 = 10,000원
      // 손절% = 2%
      // 포지션 가치 = 10,000 / 0.02 = 500,000원
      // 하지만 최대 포지션 = 1,000,000 * 0.25 = 250,000원 (제한!)
      // 포지션 크기 = 250,000 / 100,000 = 2.5개
      expect(result.limitedByMaxExposure).toBe(true);
      expect(result.positionSize.toString()).toBe('2.5');
    });
  });

  describe('calculateFixedValuePosition', () => {
    it('정상: 목표 금액으로 포지션 크기를 계산해야 함', () => {
      const positionSize = calculateFixedValuePosition(
        new Big(5000000), // 500만원 투자
        new Big(100000) // 10만원/개
      );

      expect(positionSize.toString()).toBe('50'); // 50개
    });

    it('정상: 소수점 포지션이 계산되어야 함', () => {
      const positionSize = calculateFixedValuePosition(
        new Big(3333333),
        new Big(100000)
      );

      expect(positionSize.toFixed(2)).toBe('33.33');
    });
  });

  describe('calculateMultipleRiskSizes', () => {
    it('정상: 여러 리스크 퍼센트로 계산해야 함', () => {
      const results = calculateMultipleRiskSizes(
        new Big(10000000),
        new Big(100000),
        new Big(90000), // 10% 손절 (제한 안 걸리도록)
        [0.005, 0.01, 0.015, 0.02]
      );

      expect(results.length).toBe(4);

      // 리스크가 증가하면 포지션 크기도 증가
      expect(results[0].positionSize.lt(results[1].positionSize)).toBe(true);
      expect(results[1].positionSize.lt(results[2].positionSize)).toBe(true);
      expect(results[2].positionSize.lt(results[3].positionSize)).toBe(true);

      // 0.5% 리스크
      expect(results[0].riskAmount.toString()).toBe('50000');
      // 2% 리스크
      expect(results[3].riskAmount.toString()).toBe('200000');
    });

    it('정상: 빈 배열이면 빈 결과를 반환해야 함', () => {
      const results = calculateMultipleRiskSizes(
        new Big(10000000),
        new Big(100000),
        new Big(98000),
        []
      );

      expect(results.length).toBe(0);
    });
  });
});
