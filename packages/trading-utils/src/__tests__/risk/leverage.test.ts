import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  getMaxLeverage,
  validateLeverage,
  calculatePortfolioLeverage,
  validatePortfolioLeverage,
} from '../../risk/leverage.js';

describe('getMaxLeverage', () => {
  it('BTC의 최대 레버리지는 1.5x여야 함', () => {
    expect(getMaxLeverage('BTC')).toBe(1.5);
  });

  it('ETH의 최대 레버리지는 1.5x여야 함', () => {
    expect(getMaxLeverage('ETH')).toBe(1.5);
  });

  it('기타 알트코인의 최대 레버리지는 1.2x여야 함', () => {
    expect(getMaxLeverage('SOL')).toBe(1.2);
    expect(getMaxLeverage('ADA')).toBe(1.2);
    expect(getMaxLeverage('UNKNOWN')).toBe(1.2);
  });
});

describe('validateLeverage', () => {
  it('레버리지가 한도 이내이면 통과해야 함', () => {
    const result = validateLeverage(
      'BTC',
      new Big(1000000), // 100만원 포지션
      new Big(1000000) // 100만원 계좌 => 1.0x
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.requestedLeverage.toNumber()).toBe(1.0);
    expect(result.maxLeverage.toNumber()).toBe(1.5);
  });

  it('BTC 레버리지가 1.5x를 초과하면 실패해야 함', () => {
    const result = validateLeverage(
      'BTC',
      new Big(2000000), // 200만원 포지션
      new Big(1000000) // 100만원 계좌 => 2.0x (한도 1.5x 초과)
    );

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('1.5x 초과');
    expect(result.requestedLeverage.toNumber()).toBe(2.0);
  });

  it('알트코인 레버리지가 1.2x를 초과하면 실패해야 함', () => {
    const result = validateLeverage(
      'SOL',
      new Big(1300000), // 130만원 포지션
      new Big(1000000) // 100만원 계좌 => 1.3x (한도 1.2x 초과)
    );

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('1.2x 초과');
  });

  it('BTC 레버리지 정확히 1.5x는 통과해야 함', () => {
    const result = validateLeverage(
      'BTC',
      new Big(1500000), // 150만원 포지션
      new Big(1000000) // 100만원 계좌 => 1.5x
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('레버리지 0x (포지션 없음)는 통과해야 함', () => {
    const result = validateLeverage(
      'BTC',
      new Big(0),
      new Big(1000000)
    );

    expect(result.valid).toBe(true);
    expect(result.requestedLeverage.toNumber()).toBe(0);
  });
});

describe('calculatePortfolioLeverage', () => {
  it('단일 포지션의 레버리지를 계산해야 함', () => {
    const positions = [new Big(1000000)]; // 100만원
    const accountSize = new Big(1000000); // 100만원

    const leverage = calculatePortfolioLeverage(positions, accountSize);

    expect(leverage.toNumber()).toBe(1.0);
  });

  it('다중 포지션의 총 레버리지를 계산해야 함', () => {
    const positions = [
      new Big(500000), // 50만원
      new Big(300000), // 30만원
      new Big(200000), // 20만원
    ];
    const accountSize = new Big(1000000); // 100만원

    const leverage = calculatePortfolioLeverage(positions, accountSize);

    // 총 포지션: 100만원 / 계좌: 100만원 = 1.0x
    expect(leverage.toNumber()).toBe(1.0);
  });

  it('포지션이 없으면 0x를 반환해야 함', () => {
    const positions: Big[] = [];
    const accountSize = new Big(1000000);

    const leverage = calculatePortfolioLeverage(positions, accountSize);

    expect(leverage.toNumber()).toBe(0);
  });

  it('높은 레버리지를 올바르게 계산해야 함', () => {
    const positions = [
      new Big(1500000), // 150만원
    ];
    const accountSize = new Big(1000000); // 100만원

    const leverage = calculatePortfolioLeverage(positions, accountSize);

    expect(leverage.toNumber()).toBe(1.5);
  });
});

describe('validatePortfolioLeverage', () => {
  it('포트폴리오 레버리지가 1.0x 이하이면 통과해야 함', () => {
    const positions = [
      new Big(400000),
      new Big(300000),
      new Big(200000),
    ];
    const accountSize = new Big(1000000); // 총 90만원 / 100만원 = 0.9x

    const result = validatePortfolioLeverage(positions, accountSize);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.requestedLeverage.toNumber()).toBe(0.9);
    expect(result.maxLeverage.toNumber()).toBe(1.0);
  });

  it('포트폴리오 레버리지가 1.0x를 초과하면 실패해야 함', () => {
    const positions = [
      new Big(600000),
      new Big(500000),
    ];
    const accountSize = new Big(1000000); // 총 110만원 / 100만원 = 1.1x

    const result = validatePortfolioLeverage(positions, accountSize);

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('1x 초과'); // Big.js의 toString()은 "1"을 반환
    expect(result.requestedLeverage.toNumber()).toBe(1.1);
  });

  it('포트폴리오 레버리지 정확히 1.0x는 통과해야 함', () => {
    const positions = [new Big(1000000)];
    const accountSize = new Big(1000000);

    const result = validatePortfolioLeverage(positions, accountSize);

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('포지션이 없으면 통과해야 함', () => {
    const positions: Big[] = [];
    const accountSize = new Big(1000000);

    const result = validatePortfolioLeverage(positions, accountSize);

    expect(result.valid).toBe(true);
    expect(result.requestedLeverage.toNumber()).toBe(0);
  });
});
