import { describe, it, expect, vi, beforeEach } from 'vitest';
import { liquidateAllUpbitPositions } from '../../risk/liquidator.js';
import type { LiquidatorDeps } from '../../risk/liquidator.js';

const makeBalances = () => [
  { currency: 'BTC', balance: '0.5', locked: '0', avg_buy_price: '90000000' },
  { currency: 'ETH', balance: '2.0', locked: '0', avg_buy_price: '3000000' },
  { currency: 'KRW', balance: '100000', locked: '0', avg_buy_price: '1' }, // KRW 제외 대상
];

function makeDeps(overrides?: Partial<LiquidatorDeps>): LiquidatorDeps {
  return {
    fetchBalances: vi.fn().mockResolvedValue(makeBalances()),
    placeMarketSell: vi
      .fn()
      .mockResolvedValue({ success: true, orderId: 'ord-123', message: '주문 성공' }),
    saveRecord: vi.fn().mockResolvedValue(undefined),
    notify: vi.fn().mockResolvedValue(undefined),
    sleep: vi.fn().mockResolvedValue(undefined), // 백오프 즉시 처리
    ...overrides,
  };
}

describe('liquidateAllUpbitPositions', () => {
  let deps: LiquidatorDeps;

  beforeEach(() => {
    deps = makeDeps();
  });

  // ─── 기본 동작 ────────────────────────────────────────────────────────────

  it('보유 잔고가 없으면 빈 결과를 반환한다', async () => {
    deps = makeDeps({ fetchBalances: vi.fn().mockResolvedValue([]) });

    const result = await liquidateAllUpbitPositions(deps);

    expect(result.total).toBe(0);
    expect(result.success).toBe(0);
    expect(result.skipped).toBe(0);
    expect(deps.placeMarketSell).not.toHaveBeenCalled();
  });

  it('KRW 잔고는 청산 대상에서 제외된다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: false });

    const calledSymbols = vi.mocked(deps.placeMarketSell).mock.calls.map((c) => c[0]);
    expect(calledSymbols).not.toContain('KRW-KRW');
    expect(calledSymbols).toHaveLength(2);
  });

  it('수량이 0인 포지션은 skipped 처리된다', async () => {
    deps = makeDeps({
      fetchBalances: vi.fn().mockResolvedValue([
        { currency: 'BTC', balance: '0', locked: '0', avg_buy_price: '90000000' },
        { currency: 'ETH', balance: '0.000000001', locked: '0', avg_buy_price: '3000000' }, // 최소 수량 미만
      ]),
    });

    const result = await liquidateAllUpbitPositions(deps);

    expect(result.skipped).toBe(2);
    expect(deps.placeMarketSell).not.toHaveBeenCalled();
  });

  // ─── dryRun ───────────────────────────────────────────────────────────────

  it('dryRun=true이면 placeMarketSell을 호출하지 않는다', async () => {
    const result = await liquidateAllUpbitPositions(deps, { dryRun: true });

    expect(deps.placeMarketSell).not.toHaveBeenCalled();
    expect(result.dryRun).toBe(true);
    expect(result.total).toBe(2); // KRW 제외 BTC+ETH
  });

  it('dryRun=true여도 saveRecord와 notify는 호출된다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: true });

    expect(deps.saveRecord).toHaveBeenCalled();
    expect(deps.notify).toHaveBeenCalled();
  });

  // ─── 정상 청산 ────────────────────────────────────────────────────────────

  it('정상 청산 시 모든 포지션이 success 처리된다', async () => {
    const result = await liquidateAllUpbitPositions(deps, { dryRun: false });

    expect(result.success).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results[0]!.success).toBe(true);
    expect(result.results[0]!.orderId).toBe('ord-123');
  });

  it('청산 심볼은 KRW-{currency} 형태로 변환된다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: false });

    const calledSymbols = vi.mocked(deps.placeMarketSell).mock.calls.map((c) => c[0]);
    expect(calledSymbols).toContain('KRW-BTC');
    expect(calledSymbols).toContain('KRW-ETH');
  });

  // ─── liquidatePct ─────────────────────────────────────────────────────────

  it('liquidatePct=0.5이면 잔고의 50%만 청산 주문한다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: false, liquidatePct: 0.5 });

    const btcCall = vi.mocked(deps.placeMarketSell).mock.calls.find((c) => c[0] === 'KRW-BTC');
    expect(btcCall).toBeDefined();
    // balance 0.5 * 0.5 = 0.25
    expect(parseFloat(btcCall![1])).toBeCloseTo(0.25, 8);
  });

  it('liquidatePct=1.0이면 전체 잔고로 청산 주문한다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: false, liquidatePct: 1.0 });

    const btcCall = vi.mocked(deps.placeMarketSell).mock.calls.find((c) => c[0] === 'KRW-BTC');
    expect(btcCall).toBeDefined();
    expect(parseFloat(btcCall![1])).toBeCloseTo(0.5, 8);
  });

  // ─── 재시도 ───────────────────────────────────────────────────────────────

  it('주문 실패 시 3회까지 재시도한다', async () => {
    deps = makeDeps({
      placeMarketSell: vi
        .fn()
        .mockResolvedValueOnce({ success: false, message: '1차 실패' })
        .mockResolvedValueOnce({ success: false, message: '2차 실패' })
        .mockResolvedValueOnce({ success: true, orderId: 'ord-retry', message: '성공' }),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await liquidateAllUpbitPositions(deps, { dryRun: false });

    // BTC 3회 시도 후 성공, ETH 1회 성공 → 총 4회
    const btcCalls = vi.mocked(deps.placeMarketSell).mock.calls.filter(
      (c) => c[0] === 'KRW-BTC',
    );
    expect(btcCalls).toHaveLength(3);
    expect(result.results.find((r) => r.symbol === 'KRW-BTC')!.success).toBe(true);
  });

  it('3회 모두 실패하면 failed로 기록된다', async () => {
    deps = makeDeps({
      placeMarketSell: vi.fn().mockResolvedValue({ success: false, message: '주문 실패' }),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await liquidateAllUpbitPositions(deps, { dryRun: false });

    // BTC 3회 + ETH 3회 = 6회
    expect(deps.placeMarketSell).toHaveBeenCalledTimes(6);
    expect(result.failed).toBe(2);
    expect(result.success).toBe(0);
  });

  it('1개 성공 1개 실패인 경우 부분 결과를 반환한다', async () => {
    deps = makeDeps({
      placeMarketSell: vi
        .fn()
        .mockResolvedValueOnce({ success: true, orderId: 'ord-btc', message: 'ok' })
        .mockResolvedValue({ success: false, message: 'ETH 주문 실패' }),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const result = await liquidateAllUpbitPositions(deps, { dryRun: false });

    expect(result.success).toBe(1);
    expect(result.failed).toBe(1);
  });

  it('실패 시 sleep으로 백오프를 수행한다', async () => {
    const sleepMock = vi.fn().mockResolvedValue(undefined);
    deps = makeDeps({
      placeMarketSell: vi
        .fn()
        .mockResolvedValueOnce({ success: false, message: '실패' })
        .mockResolvedValue({ success: true, orderId: 'ord-ok', message: 'ok' }),
      sleep: sleepMock,
    });

    await liquidateAllUpbitPositions(deps, { dryRun: false });

    // 첫 번째 실패 후 백오프 sleep 호출 확인
    expect(sleepMock).toHaveBeenCalled();
  });

  // ─── 알림 ─────────────────────────────────────────────────────────────────

  it('실패한 심볼이 있으면 notify를 호출한다', async () => {
    deps = makeDeps({
      placeMarketSell: vi.fn().mockResolvedValue({ success: false, message: '실패' }),
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    await liquidateAllUpbitPositions(deps, { dryRun: false });

    expect(deps.notify).toHaveBeenCalled();
    const notifyArgs = vi.mocked(deps.notify).mock.calls[0];
    expect(notifyArgs![0]).toContain('청산 실패');
  });

  it('모두 성공해도 완료 알림을 발송한다', async () => {
    await liquidateAllUpbitPositions(deps, { dryRun: false });

    expect(deps.notify).toHaveBeenCalledTimes(1);
    const notifyArgs = vi.mocked(deps.notify).mock.calls[0];
    expect(notifyArgs![0]).toContain('청산 완료');
  });
});
