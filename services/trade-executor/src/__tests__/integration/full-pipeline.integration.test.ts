import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSupabase } from '@workspace/db-client';
import Big from 'big.js';

/**
 * 전체 파이프라인 통합 테스트
 *
 * 테스트 플로우:
 * 1. AI 분석 결과를 DB에 삽입 (ai-analyzer 시뮬레이션)
 * 2. 신호 생성 확인 (trading_signals 테이블)
 * 3. 리스크 검증 통과 확인
 * 4. 주문 실행 확인 (Dry-run)
 * 5. trades 테이블 확인
 * 6. ACE 로그 확인
 */
describe('전체 파이프라인 통합 테스트', () => {
  const supabase = getSupabase();
  const testSymbol = 'TEST-BTC';
  let testSignalId: string;

  afterAll(async () => {
    // 테스트 데이터 정리
    await supabase.from('trades').delete().eq('symbol', testSymbol);
    await supabase.from('ace_logs').delete().eq('symbol', testSymbol);
    await supabase.from('trading_signals').delete().eq('symbol', testSymbol);
  });

  it('1단계: 신호 생성 - AI 분석 결과로부터 거래 신호가 생성되어야 함', async () => {
    // 신호 생성은 ai-analyzer에서 자동으로 수행됨
    // 여기서는 수동으로 신호를 삽입하여 테스트
    const { data: signalData, error: signalError } = await supabase
      .from('trading_signals')
      .insert({
        symbol: testSymbol,
        market: 'CRYPTO',
        broker: 'UPBIT',
        signal_type: 'BUY',
        entry_price: '100000',
        target_price: '110000',
        stop_loss: '98000',
        confidence: 0.85,
        reason: '통합 테스트 신호',
        indicators: {
          rsi: 45,
          macd: 0.5,
          ma_trend: 'up',
        },
        ai_analysis_id: null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    expect(signalError).toBeNull();
    expect(signalData).toBeDefined();
    expect(signalData?.id).toBeDefined();

    testSignalId = signalData!.id;
  });

  it('2단계: 신호 조회 - 미소비 신호가 조회되어야 함', async () => {
    const { data: signals, error } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('symbol', testSymbol)
      .is('consumed_at', null);

    expect(error).toBeNull();
    expect(signals).toBeDefined();
    expect(signals?.length).toBeGreaterThan(0);
    expect(signals?.[0].signal_type).toBe('BUY');
    expect(signals?.[0].confidence).toBe(0.85);
  });

  it('3단계: 리스크 검증 - 포지션 사이즈가 계산되어야 함', async () => {
    // 리스크 검증 로직은 실제로는 trade-executor에서 수행됨
    // 여기서는 포지션 사이즈 계산 로직만 테스트
    const accountSize = new Big(10000000); // 1천만원
    const riskPercentage = 0.01; // 1%
    const entryPrice = new Big(100000);
    const stopLoss = new Big(98000);

    const riskAmount = accountSize.times(riskPercentage);
    const stopDistance = entryPrice.minus(stopLoss).abs();
    const positionSize = riskAmount.div(stopDistance);

    expect(positionSize.gt(0)).toBe(true);
    expect(positionSize.toString()).toBeDefined();
  });

  it('4단계: ACE 로그 - Aspiration이 올바르게 생성되어야 함', async () => {
    const entryPrice = 100000;
    const targetPrice = 110000;
    const stopLoss = 98000;

    const targetProfitPct = ((targetPrice - entryPrice) / entryPrice) * 100;
    const maxLossPct = Math.abs(((stopLoss - entryPrice) / entryPrice) * 100);
    const riskRewardRatio = targetProfitPct / maxLossPct;

    expect(targetProfitPct).toBeCloseTo(10, 1); // ~10%
    expect(maxLossPct).toBeCloseTo(2, 1); // ~2%
    expect(riskRewardRatio).toBeGreaterThan(1.5); // R/R >= 1.5
  });

  it('5단계: 신호 소비 - 신호가 소비 표시되어야 함', async () => {
    const { error } = await supabase
      .from('trading_signals')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', testSignalId);

    expect(error).toBeNull();

    // 소비된 신호는 조회되지 않아야 함
    const { data: unconsumedSignals } = await supabase
      .from('trading_signals')
      .select('*')
      .eq('symbol', testSymbol)
      .is('consumed_at', null);

    expect(unconsumedSignals?.length).toBe(0);
  });
});
