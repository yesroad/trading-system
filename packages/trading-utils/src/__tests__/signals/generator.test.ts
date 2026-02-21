import { describe, it, expect, vi, beforeEach } from 'vitest';
import Big from 'big.js';
import { generateSignalFromAIAnalysis } from '../../signals/generator.js';
import type { SignalGenerationParams, TechnicalSnapshot } from '../../signals/types.js';

// 모킹
vi.mock('@workspace/db-client', () => ({
  insertTradingSignal: vi.fn(),
}));

vi.mock('../../signals/technical-analyzer.js', () => ({
  analyzeTechnicalIndicators: vi.fn(),
}));

vi.mock('@workspace/shared-utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { insertTradingSignal } from '@workspace/db-client';
import { analyzeTechnicalIndicators } from '../../signals/technical-analyzer.js';

describe('generateSignalFromAIAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockTechnicalSnapshot: TechnicalSnapshot = {
    sma20: new Big(100),
    ema20: new Big(101),
    macd: {
      macd: new Big(1.5),
      signal: new Big(1.0),
      histogram: new Big(0.5),
    },
    rsi: {
      value: new Big(55),
      overbought: false,
      oversold: false,
    },
    volume: {
      avgVolume: new Big(1000000),
      currentVolume: new Big(1500000),
      volumeRatio: new Big(1.5),
      isHighVolume: true,
    },
    supportResistance: [
      { price: new Big(95), type: 'support' as const, strength: 0.8, touches: 3 },
      { price: new Big(105), type: 'resistance' as const, strength: 0.7, touches: 2 },
    ],
    atr: new Big(2.5),
    currentPrice: new Big(100),
    calculatedAt: '2026-02-15T10:00:00Z',
  };

  const baseParams: SignalGenerationParams = {
    aiAnalysisId: 'test-analysis-id',
    symbol: 'BTC',
    market: 'CRYPTO',
    broker: 'UPBIT',
    aiDecision: 'BUY',
    aiConfidence: 0.85,
    priceAtAnalysis: '99',
    aiReasoning: 'Strong uptrend',
  };

  it('AI 결정이 SKIP이면 null을 반환해야 함', async () => {
    const params: SignalGenerationParams = {
      ...baseParams,
      aiDecision: 'SKIP',
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).toBeNull();
    expect(analyzeTechnicalIndicators).not.toHaveBeenCalled();
  });

  it('AI 신뢰도가 0.4 미만이면 null을 반환해야 함', async () => {
    const params: SignalGenerationParams = {
      ...baseParams,
      aiConfidence: 0.3,
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).toBeNull();
    expect(analyzeTechnicalIndicators).not.toHaveBeenCalled();
  });

  it('ATR 데이터가 없으면 null을 반환해야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue({
      ...mockTechnicalSnapshot,
      atr: null,
    });

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).toBeNull();
    expect(insertTradingSignal).not.toHaveBeenCalled();
  });

  it('BUY 신호를 정상적으로 생성해야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id-123');

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).not.toBeNull();
    expect(result?.signal_type).toBe('BUY');
    expect(result?.confidence).toBeGreaterThan(0);
    expect(result?.id).toBe('signal-id-123');

    // DB 저장 확인
    expect(insertTradingSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        symbol: 'BTC',
        market: 'CRYPTO',
        broker: 'UPBIT',
        signal_type: 'BUY',
        ai_analysis_id: 'test-analysis-id',
      })
    );
  });

  it('SELL 신호를 정상적으로 생성해야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id-456');

    const params: SignalGenerationParams = {
      ...baseParams,
      aiDecision: 'SELL',
      priceAtAnalysis: '101',
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).not.toBeNull();
    expect(result?.signal_type).toBe('SELL');
    expect(result?.id).toBe('signal-id-456');

    expect(insertTradingSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        signal_type: 'SELL',
      })
    );
  });

  it('진입가가 올바르게 계산되어야 함 (BUY - 더 낮은 가격 선택)', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    // currentPrice(100) vs priceAtAnalysis(99) → 99 선택
    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).not.toBeNull();
    const entryPrice = new Big(result!.entry_price);
    expect(entryPrice.toNumber()).toBe(99);
  });

  it('진입가가 올바르게 계산되어야 함 (SELL - 더 높은 가격 선택)', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const params: SignalGenerationParams = {
      ...baseParams,
      aiDecision: 'SELL',
      priceAtAnalysis: '99',
    };

    // currentPrice(100) vs priceAtAnalysis(99) → 100 선택
    const result = await generateSignalFromAIAnalysis(params);

    expect(result).not.toBeNull();
    const entryPrice = new Big(result!.entry_price);
    expect(entryPrice.toNumber()).toBe(100);
  });

  it('진입가가 올바르게 보정되어야 함 (BUY - priceAtAnalysis가 0이면 현재가 사용)', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const params: SignalGenerationParams = {
      ...baseParams,
      priceAtAnalysis: '0',
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).not.toBeNull();
    const entryPrice = new Big(result!.entry_price);
    expect(entryPrice.toNumber()).toBe(100);
  });

  it('목표가와 손절가가 올바르게 계산되어야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).not.toBeNull();

    const entry = new Big(result!.entry_price);
    const target = new Big(result!.target_price);
    const stopLoss = new Big(result!.stop_loss);

    // BUY 신호이므로
    expect(target.gt(entry)).toBe(true); // 목표가 > 진입가
    expect(stopLoss.lt(entry)).toBe(true); // 손절가 < 진입가

    // R/R 비율 확인 (목표 2.0 이상)
    const stopDistance = entry.minus(stopLoss).abs();
    const targetDistance = target.minus(entry).abs();
    const rr = targetDistance.div(stopDistance);
    expect(rr.gte(1.5)).toBe(true);
  });

  it('신뢰도가 올바르게 블렌딩되어야 함 (60% AI + 40% 기술적)', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const params: SignalGenerationParams = {
      ...baseParams,
      aiConfidence: 0.8,
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).not.toBeNull();
    // 최종 신뢰도는 0.4 ~ 1.0 범위
    expect(result!.confidence).toBeGreaterThanOrEqual(0.4);
    expect(result!.confidence).toBeLessThanOrEqual(1.0);
  });

  it('지표 스냅샷이 올바르게 직렬화되어야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).not.toBeNull();
    expect(result!.indicators).toBeDefined();

    const indicators = result!.indicators as {
      sma20: string | null;
      ema20: string | null;
      macd: { macd: string; signal: string; histogram: string } | null;
      rsi: { value: string; overbought: boolean; oversold: boolean } | null;
      currentPrice: string;
    };

    expect(indicators.sma20).toBe('100');
    expect(indicators.ema20).toBe('101');
    expect(indicators.macd?.macd).toBe('1.5');
    expect(indicators.rsi?.value).toBe('55');
    expect(indicators.currentPrice).toBe('100');
  });

  it('AI 근거가 reason에 포함되어야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const params: SignalGenerationParams = {
      ...baseParams,
      aiReasoning: 'Strong uptrend with volume confirmation',
    };

    const result = await generateSignalFromAIAnalysis(params);

    expect(result).not.toBeNull();
    expect(result!.reason).toContain('Strong uptrend with volume confirmation');
    expect(result!.reason).toContain('AI 결정: BUY');
  });

  it('에러 발생 시 null을 반환해야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockRejectedValue(new Error('DB connection failed'));

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).toBeNull();
    expect(insertTradingSignal).not.toHaveBeenCalled();
  });

  it('낮은 기술적 신뢰도로 인해 최종 신뢰도가 0.4 미만이면 null', async () => {
    // 모든 기술적 지표가 약한 신호
    const weakSnapshot: TechnicalSnapshot = {
      sma20: null,
      ema20: null,
      macd: null,
      rsi: null,
      volume: null,
      supportResistance: [],
      atr: new Big(2.5),
      currentPrice: new Big(100),
      calculatedAt: '2026-02-15T10:00:00Z',
    };

    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(weakSnapshot);

    const params: SignalGenerationParams = {
      ...baseParams,
      aiConfidence: 0.5, // AI 신뢰도도 낮음
    };

    const result = await generateSignalFromAIAnalysis(params);

    // 기술적 신뢰도 0.0, AI 0.5 → 블렌딩: 0.5*0.6 + 0.0*0.4 = 0.3 < 0.4
    expect(result).toBeNull();
  });

  it('생성 시각이 포함되어야 함', async () => {
    vi.mocked(analyzeTechnicalIndicators).mockResolvedValue(mockTechnicalSnapshot);
    vi.mocked(insertTradingSignal).mockResolvedValue('signal-id');

    const result = await generateSignalFromAIAnalysis(baseParams);

    expect(result).not.toBeNull();
    expect(result!.created_at).toBeDefined();
    expect(typeof result!.created_at).toBe('string');
    // ISO 8601 형식 확인
    expect(result!.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
