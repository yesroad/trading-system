import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import {
  checkTotalExposure,
  checkSymbolExposure,
  calculateAvailableCapital,
} from '../../risk/exposure.js';

describe('checkTotalExposure', () => {
  it('노출이 한도 이내이면 통과해야 함', () => {
    const result = checkTotalExposure(
      [new Big(300000), new Big(200000)], // 현재: 50만원
      new Big(200000), // 신규: 20만원
      new Big(1000000), // 계좌: 100만원
      1.0 // 최대 100%
    );

    // 현재 50% + 신규 20% = 70% (< 100%)
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.currentExposure.toNumber()).toBe(0.5);
    expect(result.newExposure.toNumber()).toBe(0.7);
  });

  it('노출이 한도를 초과하면 실패해야 함', () => {
    const result = checkTotalExposure(
      [new Big(600000)], // 현재: 60만원
      new Big(500000), // 신규: 50만원
      new Big(1000000), // 계좌: 100만원
      1.0 // 최대 100%
    );

    // 현재 60% + 신규 50% = 110% (> 100%)
    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('100% 초과');
    expect(result.newExposure.toNumber()).toBe(1.1);
  });

  it('정확히 최대 노출(100%)는 통과해야 함', () => {
    const result = checkTotalExposure(
      [new Big(500000)],
      new Big(500000),
      new Big(1000000),
      1.0
    );

    expect(result.valid).toBe(true);
    expect(result.newExposure.toNumber()).toBe(1.0);
  });

  it('현재 포지션이 없으면 신규만 검증해야 함', () => {
    const result = checkTotalExposure(
      [],
      new Big(300000),
      new Big(1000000),
      1.0
    );

    expect(result.valid).toBe(true);
    expect(result.currentExposure.toNumber()).toBe(0);
    expect(result.newExposure.toNumber()).toBe(0.3);
  });

  it('신규 포지션이 0이면 현재 노출만 반환해야 함', () => {
    const result = checkTotalExposure(
      [new Big(400000)],
      new Big(0),
      new Big(1000000),
      1.0
    );

    expect(result.valid).toBe(true);
    expect(result.currentExposure.toNumber()).toBe(0.4);
    expect(result.newExposure.toNumber()).toBe(0.4);
  });

  it('사용자 정의 최대 노출(80%)을 적용해야 함', () => {
    const result = checkTotalExposure(
      [new Big(500000)],
      new Big(400000),
      new Big(1000000),
      0.8 // 최대 80%
    );

    // 50% + 40% = 90% (> 80%)
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('80% 초과');
  });
});

describe('checkSymbolExposure', () => {
  it('심볼 노출이 한도(25%) 이내이면 통과해야 함', () => {
    const result = checkSymbolExposure(
      new Big(200000), // 20만원 포지션
      new Big(1000000), // 100만원 계좌
      0.25 // 최대 25%
    );

    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.newExposure.toNumber()).toBe(0.2);
  });

  it('심볼 노출이 한도를 초과하면 실패해야 함', () => {
    const result = checkSymbolExposure(
      new Big(300000),
      new Big(1000000),
      0.25
    );

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.violations[0]).toContain('25% 초과');
    expect(result.newExposure.toNumber()).toBe(0.3);
  });

  it('정확히 최대 노출(25%)는 통과해야 함', () => {
    const result = checkSymbolExposure(
      new Big(250000),
      new Big(1000000),
      0.25
    );

    expect(result.valid).toBe(true);
    expect(result.newExposure.toNumber()).toBe(0.25);
  });

  it('포지션이 0이면 통과해야 함', () => {
    const result = checkSymbolExposure(
      new Big(0),
      new Big(1000000),
      0.25
    );

    expect(result.valid).toBe(true);
    expect(result.newExposure.toNumber()).toBe(0);
  });

  it('사용자 정의 최대 노출(10%)을 적용해야 함', () => {
    const result = checkSymbolExposure(
      new Big(150000),
      new Big(1000000),
      0.1 // 최대 10%
    );

    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain('10% 초과');
  });
});

describe('calculateAvailableCapital', () => {
  it('사용 가능 자본을 올바르게 계산해야 함', () => {
    const available = calculateAvailableCapital(
      new Big(1000000), // 100만원 계좌
      [new Big(300000), new Big(200000)], // 50만원 사용 중
      1.0 // 최대 100%
    );

    // 100만원 - 50만원 = 50만원
    expect(available.toNumber()).toBe(500000);
  });

  it('포지션이 없으면 전액 사용 가능해야 함', () => {
    const available = calculateAvailableCapital(
      new Big(1000000),
      [],
      1.0
    );

    expect(available.toNumber()).toBe(1000000);
  });

  it('최대 노출(80%)을 고려해야 함', () => {
    const available = calculateAvailableCapital(
      new Big(1000000),
      [new Big(300000)],
      0.8 // 최대 80%
    );

    // 100만원 * 0.8 - 30만원 = 50만원
    expect(available.toNumber()).toBe(500000);
  });

  it('이미 최대 노출이면 0을 반환해야 함', () => {
    const available = calculateAvailableCapital(
      new Big(1000000),
      [new Big(1000000)],
      1.0
    );

    expect(available.toNumber()).toBe(0);
  });

  it('노출이 최대를 초과해도 0을 반환해야 함 (음수 방지)', () => {
    const available = calculateAvailableCapital(
      new Big(1000000),
      [new Big(1200000)], // 120% 노출
      1.0
    );

    expect(available.toNumber()).toBe(0);
  });

  it('다중 포지션의 사용 가능 자본을 계산해야 함', () => {
    const available = calculateAvailableCapital(
      new Big(2000000),
      [new Big(400000), new Big(300000), new Big(200000)],
      1.0
    );

    // 200만원 - 90만원 = 110만원
    expect(available.toNumber()).toBe(1100000);
  });
});
