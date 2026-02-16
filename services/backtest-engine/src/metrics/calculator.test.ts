import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  calculateTotalReturn,
  calculateMaxDrawdown,
  calculateWinRate,
  calculateProfitFactor,
} from './calculator.js';
import type { Trade, EquityPoint } from '../types.js';

describe('성과 지표 계산', () => {
  describe('calculateTotalReturn', () => {
    it('수익률 계산', () => {
      const initialCapital = new Big(10000000);
      const finalCapital = new Big(12000000);

      const totalReturn = calculateTotalReturn(initialCapital, finalCapital);

      // (12M - 10M) / 10M × 100 = 20%
      expect(totalReturn).toBeCloseTo(20, 2);
    });

    it('손실률 계산', () => {
      const initialCapital = new Big(10000000);
      const finalCapital = new Big(8000000);

      const totalReturn = calculateTotalReturn(initialCapital, finalCapital);

      // (8M - 10M) / 10M × 100 = -20%
      expect(totalReturn).toBeCloseTo(-20, 2);
    });
  });

  describe('calculateMaxDrawdown', () => {
    it('최대 낙폭 계산', () => {
      const equity: EquityPoint[] = [
        { timestamp: '2025-01-01', equity: new Big(10000000) },
        { timestamp: '2025-01-02', equity: new Big(12000000) }, // Peak
        { timestamp: '2025-01-03', equity: new Big(10000000) },
        { timestamp: '2025-01-04', equity: new Big(9000000) }, // Max DD from peak
        { timestamp: '2025-01-05', equity: new Big(11000000) },
      ];

      const maxDrawdown = calculateMaxDrawdown(equity);

      // (12M - 9M) / 12M × 100 = 25%
      expect(maxDrawdown).toBeCloseTo(25, 2);
    });

    it('상승장에서 낙폭 0', () => {
      const equity: EquityPoint[] = [
        { timestamp: '2025-01-01', equity: new Big(10000000) },
        { timestamp: '2025-01-02', equity: new Big(11000000) },
        { timestamp: '2025-01-03', equity: new Big(12000000) },
      ];

      const maxDrawdown = calculateMaxDrawdown(equity);

      expect(maxDrawdown).toBe(0);
    });
  });

  describe('calculateWinRate', () => {
    it('승률 계산', () => {
      const trades: Trade[] = [
        {
          symbol: 'BTC',
          side: 'BUY',
          qty: new Big(1),
          price: new Big(100),
          timestamp: '2025-01-01',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(10), // 승리
        },
        {
          symbol: 'BTC',
          side: 'SELL',
          qty: new Big(1),
          price: new Big(90),
          timestamp: '2025-01-02',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(-5), // 손실
        },
        {
          symbol: 'BTC',
          side: 'BUY',
          qty: new Big(1),
          price: new Big(100),
          timestamp: '2025-01-03',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(15), // 승리
        },
      ];

      const { winRate, winningTrades, losingTrades } = calculateWinRate(trades);

      // 2 / 3 × 100 = 66.67%
      expect(winRate).toBeCloseTo(66.67, 2);
      expect(winningTrades).toBe(2);
      expect(losingTrades).toBe(1);
    });
  });

  describe('calculateProfitFactor', () => {
    it('Profit Factor 계산', () => {
      const trades: Trade[] = [
        {
          symbol: 'BTC',
          side: 'BUY',
          qty: new Big(1),
          price: new Big(100),
          timestamp: '2025-01-01',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(20), // 총 수익 20
        },
        {
          symbol: 'BTC',
          side: 'SELL',
          qty: new Big(1),
          price: new Big(90),
          timestamp: '2025-01-02',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(-10), // 총 손실 10
        },
        {
          symbol: 'BTC',
          side: 'BUY',
          qty: new Big(1),
          price: new Big(100),
          timestamp: '2025-01-03',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(10), // 총 수익 30
        },
      ];

      const profitFactor = calculateProfitFactor(trades);

      // (20 + 10) / 10 = 3.0
      expect(profitFactor).toBeCloseTo(3.0, 1);
    });

    it('손실만 있으면 0', () => {
      const trades: Trade[] = [
        {
          symbol: 'BTC',
          side: 'BUY',
          qty: new Big(1),
          price: new Big(100),
          timestamp: '2025-01-01',
          commission: new Big(0.1),
          slippage: new Big(0.05),
          realizedPnL: new Big(-10),
        },
      ];

      const profitFactor = calculateProfitFactor(trades);

      expect(profitFactor).toBe(0);
    });
  });
});
