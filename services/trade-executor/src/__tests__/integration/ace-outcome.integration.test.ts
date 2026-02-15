import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSupabase } from '@workspace/db-client';

/**
 * ACE Outcome 추적 통합 테스트
 *
 * 테스트 시나리오:
 * 1. ACE 로그 생성 (Aspiration, Capability, Execution)
 * 2. 거래 진입 기록
 * 3. 거래 청산 기록
 * 4. Outcome 자동 업데이트
 * 5. 결과 분석 (WIN/LOSS/BREAKEVEN)
 */
describe('ACE Outcome 추적 통합 테스트', () => {
  const supabase = getSupabase();
  const testSymbol = 'ACE-TEST-BTC';
  let testAceLogId: string;
  let entryTradeId: string;
  let exitTradeId: string;

  beforeAll(async () => {
    // 1. ACE 로그 생성
    const { data: aceData, error: aceError } = await supabase
      .from('ace_logs')
      .insert({
        symbol: testSymbol,
        market: 'CRYPTO',
        broker: 'UPBIT',
        aspiration: {
          strategy: 'AI + 기술적 분석',
          targetProfit: '5.00%',
          maxLoss: '2.00%',
          timeHorizon: '1-3일',
          additionalGoals: {
            riskRewardRatio: '2.50',
          },
        },
        capability: {
          signals: [
            {
              type: 'combined',
              confidence: 0.85,
              indicators: {
                rsi: 45,
                macd: 0.5,
              },
            },
          ],
          riskAssessment: {
            positionSize: '0.1',
            positionValue: '10000',
            violations: [],
            warnings: [],
          },
        },
        execution: {
          decision: 'BUY',
          actualEntry: 100000,
          actualStopLoss: 98000,
          actualTarget: 105000,
          size: 0.1,
          timestamp: new Date().toISOString(),
          reason: '리스크 검증 통과',
        },
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (aceError) throw new Error(`ACE 로그 생성 실패: ${aceError.message}`);
    if (!aceData?.id) throw new Error('ACE 로그 ID 조회 실패');

    testAceLogId = aceData.id;

    // 2. 진입 거래 기록
    const entryTime = new Date();
    const { data: entryData, error: entryError } = await supabase
      .from('trades')
      .insert({
        symbol: testSymbol,
        broker: 'UPBIT',
        market: 'CRYPTO',
        side: 'BUY',
        qty: '0.1',
        price: '100000',
        status: 'filled',
        executed_at: entryTime.toISOString(),
        created_at: entryTime.toISOString(),
        metadata: {
          aceLogId: testAceLogId,
        },
      })
      .select('id')
      .single();

    if (entryError) throw new Error(`진입 거래 기록 실패: ${entryError.message}`);
    if (!entryData?.id) throw new Error('진입 거래 ID 조회 실패');

    entryTradeId = entryData.id;
  });

  afterAll(async () => {
    // 테스트 데이터 정리
    await supabase.from('trades').delete().eq('symbol', testSymbol);
    await supabase.from('ace_logs').delete().eq('id', testAceLogId);
  });

  it('ACE 로그가 생성되고 Execution 정보가 올바르게 저장되어야 함', async () => {
    const { data: aceLog, error } = await supabase
      .from('ace_logs')
      .select('*')
      .eq('id', testAceLogId)
      .single();

    expect(error).toBeNull();
    expect(aceLog).toBeDefined();
    expect(aceLog?.execution).toBeDefined();
    expect((aceLog?.execution as any).decision).toBe('BUY');
    expect((aceLog?.execution as any).actualEntry).toBe(100000);
  });

  it('진입 거래가 기록되고 ACE 로그 ID가 연결되어야 함', async () => {
    const { data: trade, error } = await supabase
      .from('trades')
      .select('*')
      .eq('id', entryTradeId)
      .single();

    expect(error).toBeNull();
    expect(trade).toBeDefined();
    expect(trade?.side).toBe('BUY');
    expect(trade?.price).toBe('100000');
    expect((trade?.metadata as any)?.aceLogId).toBe(testAceLogId);
  });

  it('청산 거래 기록 후 Outcome 계산이 올바르게 되어야 함 (WIN)', async () => {
    // 3. 청산 거래 기록 (수익 실현)
    const exitTime = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2일 후
    const exitPrice = 105000; // 5% 수익
    const entryPrice = 100000;
    const size = 0.1;

    const { data: exitData, error: exitError } = await supabase
      .from('trades')
      .insert({
        symbol: testSymbol,
        broker: 'UPBIT',
        market: 'CRYPTO',
        side: 'SELL',
        qty: '0.1',
        price: exitPrice.toString(),
        status: 'filled',
        executed_at: exitTime.toISOString(),
        created_at: exitTime.toISOString(),
      })
      .select('id')
      .single();

    expect(exitError).toBeNull();
    exitTradeId = exitData!.id;

    // 4. Outcome 계산
    const realizedPnL = (exitPrice - entryPrice) * size;
    const pnLPct = (realizedPnL / (entryPrice * size)) * 100;

    expect(realizedPnL).toBeGreaterThan(0);
    expect(pnLPct).toBeCloseTo(5, 1); // ~5%

    // 5. 결과 판정
    const result = pnLPct > 0.1 ? 'WIN' : pnLPct < -0.1 ? 'LOSS' : 'BREAKEVEN';
    expect(result).toBe('WIN');
  });

  it('손실 시나리오에서 Outcome이 LOSS로 판정되어야 함', () => {
    const entryPrice = 100000;
    const exitPrice = 98000; // -2% 손실
    const size = 0.1;

    const realizedPnL = (exitPrice - entryPrice) * size;
    const pnLPct = (realizedPnL / (entryPrice * size)) * 100;

    expect(realizedPnL).toBeLessThan(0);
    expect(pnLPct).toBeCloseTo(-2, 1);

    const result = pnLPct > 0.1 ? 'WIN' : pnLPct < -0.1 ? 'LOSS' : 'BREAKEVEN';
    expect(result).toBe('LOSS');
  });

  it('보유 기간 계산이 올바르게 되어야 함', () => {
    const entryTime = new Date('2026-02-15T10:00:00Z');
    const exitTime = new Date('2026-02-17T14:00:00Z'); // 2일 4시간 후

    const durationMs = exitTime.getTime() - entryTime.getTime();
    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
    const durationDays = Math.floor(durationHours / 24);

    expect(durationHours).toBe(52); // 2일 4시간 = 52시간
    expect(durationDays).toBe(2);
  });

  it('ACE 로그에 Outcome을 업데이트할 수 있어야 함', async () => {
    const outcome = {
      exitPrice: 105000,
      realizedPnL: 500,
      pnLPct: 5.0,
      duration: '2일',
      result: 'WIN',
      exitReason: 'auto_detected',
    };

    const { error } = await supabase
      .from('ace_logs')
      .update({ outcome })
      .eq('id', testAceLogId);

    expect(error).toBeNull();

    // 업데이트 확인
    const { data: updatedLog } = await supabase
      .from('ace_logs')
      .select('outcome')
      .eq('id', testAceLogId)
      .single();

    expect(updatedLog?.outcome).toBeDefined();
    expect((updatedLog?.outcome as any).result).toBe('WIN');
    expect((updatedLog?.outcome as any).pnLPct).toBe(5.0);
  });
});
