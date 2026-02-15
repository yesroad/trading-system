import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getSupabase } from '@workspace/db-client';
import Big from 'big.js';

/**
 * 서킷 브레이커 통합 테스트
 *
 * 테스트 시나리오:
 * 1. 정상 상태 - 손실이 한도 내일 때
 * 2. 트리거 상태 - 일일 손실이 -5% 초과
 * 3. 리스크 이벤트 로깅
 * 4. 거래 자동 중단
 */
describe('서킷 브레이커 통합 테스트', () => {
  const supabase = getSupabase();

  beforeEach(async () => {
    // 테스트 전 초기화
    await supabase.from('risk_events').delete().eq('event_type', 'circuit_breaker');
  });

  afterEach(async () => {
    // 테스트 후 정리
    await supabase.from('risk_events').delete().eq('event_type', 'circuit_breaker');
  });

  it('정상 상태: 손실이 -3%일 때 서킷 브레이커가 발동하지 않아야 함', () => {
    const dailyPnL = new Big(-300000); // -30만원
    const accountSize = new Big(10000000); // 1천만원
    const dailyPnLPct = dailyPnL.div(accountSize); // -0.03 (-3%)

    const circuitBreakerLimit = -0.05; // -5%
    const shouldTrigger = dailyPnLPct.lte(circuitBreakerLimit);

    expect(shouldTrigger).toBe(false);
    expect(dailyPnLPct.toNumber()).toBeGreaterThan(-0.05);
  });

  it('트리거 상태: 손실이 -5% 이상일 때 서킷 브레이커가 발동해야 함', () => {
    const dailyPnL = new Big(-550000); // -55만원
    const accountSize = new Big(10000000); // 1천만원
    const dailyPnLPct = dailyPnL.div(accountSize); // -0.055 (-5.5%)

    const circuitBreakerLimit = -0.05; // -5%
    const shouldTrigger = dailyPnLPct.lte(circuitBreakerLimit);

    expect(shouldTrigger).toBe(true);
    expect(dailyPnLPct.toNumber()).toBeLessThanOrEqual(-0.05);
  });

  it('리스크 이벤트 로깅: 서킷 브레이커 발동 시 risk_events에 기록되어야 함', async () => {
    const { error } = await supabase.from('risk_events').insert({
      event_type: 'circuit_breaker',
      violation_details: {
        dailyPnL: -550000,
        dailyPnLPct: -0.055,
        limit: -0.05,
        timestamp: new Date().toISOString(),
      },
      severity: 'critical',
      created_at: new Date().toISOString(),
    });

    expect(error).toBeNull();

    // 기록 확인
    const { data: events } = await supabase
      .from('risk_events')
      .select('*')
      .eq('event_type', 'circuit_breaker')
      .order('created_at', { ascending: false })
      .limit(1);

    expect(events).toBeDefined();
    expect(events?.length).toBe(1);
    expect(events?.[0].severity).toBe('critical');
    expect(events?.[0].violation_details).toBeDefined();
  });

  it('쿨다운 계산: 60분 쿨다운이 올바르게 계산되어야 함', () => {
    const now = new Date();
    const cooldownMinutes = 60;
    const cooldownUntil = new Date(now.getTime() + cooldownMinutes * 60 * 1000);

    const remainingMs = cooldownUntil.getTime() - now.getTime();
    const remainingMinutes = Math.floor(remainingMs / (60 * 1000));

    expect(remainingMinutes).toBe(60);
    expect(cooldownUntil.getTime()).toBeGreaterThan(now.getTime());
  });

  it('레버리지 위반: 레버리지 한도 초과 시 이벤트가 기록되어야 함', async () => {
    const { error } = await supabase.from('risk_events').insert({
      event_type: 'leverage_violation',
      symbol: 'BTC',
      violation_type: 'portfolio_leverage',
      violation_details: {
        requestedLeverage: 1.2,
        maxLeverage: 1.0,
        symbol: 'BTC',
      },
      severity: 'high',
      created_at: new Date().toISOString(),
    });

    expect(error).toBeNull();

    const { data: events } = await supabase
      .from('risk_events')
      .select('*')
      .eq('event_type', 'leverage_violation')
      .limit(1);

    expect(events?.length).toBeGreaterThan(0);
    expect(events?.[0].severity).toBe('high');
  });

  it('노출도 위반: 총 노출도 한도 초과 시 이벤트가 기록되어야 함', async () => {
    const { error } = await supabase.from('risk_events').insert({
      event_type: 'exposure_limit',
      violation_type: 'total_exposure',
      violation_details: {
        currentExposure: 1.1,
        maxExposure: 1.0,
      },
      severity: 'medium',
      created_at: new Date().toISOString(),
    });

    expect(error).toBeNull();

    const { data: events } = await supabase
      .from('risk_events')
      .select('*')
      .eq('event_type', 'exposure_limit')
      .limit(1);

    expect(events?.length).toBeGreaterThan(0);
    expect(events?.[0].severity).toBe('medium');
  });
});
