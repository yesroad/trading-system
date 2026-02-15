import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  calculateATRStopLoss,
  calculateMultipleATRStopLoss,
  calculateATRStopLossShort,
} from '../../atr/stop-loss.js';

describe('calculateATRStopLoss (롱 포지션)', () => {
  it('기본 ATR 손절가를 계산해야 함 (2.0x 배수)', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(2000),
      multiplier: 2.0,
    });

    // entry - (atr * 2.0) = 100000 - 4000 = 96000
    expect(result.stopLoss.toNumber()).toBe(96000);
    expect(result.stopLossPct.toNumber()).toBe(0.04); // 4%
    expect(result.atrMultiplier).toBe(2.0);
    expect(result.clampedByMin).toBe(false);
    expect(result.clampedByMax).toBe(false);
  });

  it('손절이 최소값(0.5%)보다 작으면 최소값으로 제한해야 함', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(100), // 매우 낮은 ATR
      multiplier: 2.0,
      minPct: 0.005, // 0.5%
    });

    // ATR * 2.0 = 200 (0.2%) < 0.5% => clamped to 0.5%
    expect(result.stopLossPct.toNumber()).toBe(0.005);
    expect(result.stopLoss.toNumber()).toBe(99500); // 100000 * 0.995
    expect(result.clampedByMin).toBe(true);
    expect(result.clampedByMax).toBe(false);
  });

  it('손절이 최대값(5%)보다 크면 최대값으로 제한해야 함', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(4000), // 매우 높은 ATR
      multiplier: 2.0,
      maxPct: 0.05, // 5%
    });

    // ATR * 2.0 = 8000 (8%) > 5% => clamped to 5%
    expect(result.stopLossPct.toNumber()).toBe(0.05);
    expect(result.stopLoss.toNumber()).toBe(95000); // 100000 * 0.95
    expect(result.clampedByMin).toBe(false);
    expect(result.clampedByMax).toBe(true);
  });

  it('사용자 정의 배수를 적용해야 함', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(1000),
      multiplier: 3.0,
    });

    // entry - (atr * 3.0) = 100000 - 3000 = 97000
    expect(result.stopLoss.toNumber()).toBe(97000);
    expect(result.stopLossPct.toNumber()).toBe(0.03);
    expect(result.atrMultiplier).toBe(3.0);
  });

  it('손절 거리를 올바르게 계산해야 함', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(2000),
      multiplier: 2.0,
    });

    expect(result.stopLossDistance.toNumber()).toBe(4000);
  });

  it('기본값(multiplier=2.0, minPct=0.005, maxPct=0.05)을 사용해야 함', () => {
    const result = calculateATRStopLoss({
      entry: new Big(100000),
      atr: new Big(2000),
    });

    expect(result.atrMultiplier).toBe(2.0);
    // 4% 손절은 0.5%~5% 범위 내
    expect(result.clampedByMin).toBe(false);
    expect(result.clampedByMax).toBe(false);
  });
});

describe('calculateMultipleATRStopLoss', () => {
  it('여러 배수로 손절가를 계산해야 함', () => {
    const results = calculateMultipleATRStopLoss(
      new Big(100000),
      new Big(1000),
      [1.5, 2.0, 2.5]
    );

    expect(results).toHaveLength(3);

    // 1.5x: 100000 - 1500 = 98500
    expect(results[0].stopLoss.toNumber()).toBe(98500);
    expect(results[0].atrMultiplier).toBe(1.5);

    // 2.0x: 100000 - 2000 = 98000
    expect(results[1].stopLoss.toNumber()).toBe(98000);
    expect(results[1].atrMultiplier).toBe(2.0);

    // 2.5x: 100000 - 2500 = 97500
    expect(results[2].stopLoss.toNumber()).toBe(97500);
    expect(results[2].atrMultiplier).toBe(2.5);
  });

  it('기본 배수 [1.5, 2.0, 2.5, 3.0]을 사용해야 함', () => {
    const results = calculateMultipleATRStopLoss(
      new Big(100000),
      new Big(1000)
    );

    expect(results).toHaveLength(4);
    expect(results[0].atrMultiplier).toBe(1.5);
    expect(results[1].atrMultiplier).toBe(2.0);
    expect(results[2].atrMultiplier).toBe(2.5);
    expect(results[3].atrMultiplier).toBe(3.0);
  });

  it('각 배수별 결과가 독립적이어야 함', () => {
    const results = calculateMultipleATRStopLoss(
      new Big(100000),
      new Big(5000), // 높은 ATR
      [1.0, 2.0]
    );

    // 1.0x: 5% (제한 없음)
    expect(results[0].clampedByMax).toBe(false);

    // 2.0x: 10% (> 5%, maxPct로 제한)
    expect(results[1].clampedByMax).toBe(true);
  });
});

describe('calculateATRStopLossShort (숏 포지션)', () => {
  it('기본 ATR 손절가를 계산해야 함 (entry + distance)', () => {
    const result = calculateATRStopLossShort({
      entry: new Big(100000),
      atr: new Big(2000),
      multiplier: 2.0,
    });

    // entry + (atr * 2.0) = 100000 + 4000 = 104000
    expect(result.stopLoss.toNumber()).toBe(104000);
    expect(result.stopLossPct.toNumber()).toBe(0.04);
    expect(result.atrMultiplier).toBe(2.0);
  });

  it('손절이 최소값보다 작으면 최소값으로 제한해야 함', () => {
    const result = calculateATRStopLossShort({
      entry: new Big(100000),
      atr: new Big(100),
      multiplier: 2.0,
      minPct: 0.005,
    });

    expect(result.stopLossPct.toNumber()).toBe(0.005);
    expect(result.stopLoss.toNumber()).toBe(100500); // 100000 * 1.005
    expect(result.clampedByMin).toBe(true);
  });

  it('손절이 최대값보다 크면 최대값으로 제한해야 함', () => {
    const result = calculateATRStopLossShort({
      entry: new Big(100000),
      atr: new Big(4000),
      multiplier: 2.0,
      maxPct: 0.05,
    });

    expect(result.stopLossPct.toNumber()).toBe(0.05);
    expect(result.stopLoss.toNumber()).toBe(105000); // 100000 * 1.05
    expect(result.clampedByMax).toBe(true);
  });

  it('손절 거리를 올바르게 계산해야 함 (entry와의 차이)', () => {
    const result = calculateATRStopLossShort({
      entry: new Big(100000),
      atr: new Big(2000),
      multiplier: 2.0,
    });

    expect(result.stopLossDistance.toNumber()).toBe(4000);
  });

  it('롱 포지션과 반대 방향이어야 함', () => {
    const entry = new Big(100000);
    const atr = new Big(2000);
    const multiplier = 2.0;

    const longResult = calculateATRStopLoss({ entry, atr, multiplier });
    const shortResult = calculateATRStopLossShort({ entry, atr, multiplier });

    // 롱: entry - distance
    expect(longResult.stopLoss.toNumber()).toBe(96000);

    // 숏: entry + distance
    expect(shortResult.stopLoss.toNumber()).toBe(104000);

    // 거리는 동일
    expect(longResult.stopLossDistance.toNumber()).toBe(shortResult.stopLossDistance.toNumber());
  });
});
