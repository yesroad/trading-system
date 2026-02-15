import { describe, it, expect, vi, beforeEach } from 'vitest';
import Big from 'big.js';
import { fetchCandles, analyzeTechnicalIndicators } from '../../signals/technical-analyzer.js';
import type { Candle } from '../../types.js';

// 모킹
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  order: vi.fn(() => mockSupabase),
  limit: vi.fn(() => mockSupabase),
};

vi.mock('@workspace/db-client', () => ({
  getSupabase: () => mockSupabase,
}));

vi.mock('@workspace/shared-utils', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// 지표 계산 함수 모킹
vi.mock('../../indicators/ma.js', () => ({
  calculateMA: vi.fn((candles: Candle[], period: number, type: string) => {
    if (type === 'SMA') return new Big(100);
    if (type === 'EMA') return new Big(101);
    return new Big(100);
  }),
}));

vi.mock('../../indicators/macd.js', () => ({
  calculateMACD: vi.fn(() => ({
    macd: new Big(1.5),
    signal: new Big(1.0),
    histogram: new Big(0.5),
  })),
}));

vi.mock('../../indicators/rsi.js', () => ({
  calculateRSI: vi.fn(() => ({
    value: new Big(55),
    overbought: false,
    oversold: false,
  })),
}));

vi.mock('../../indicators/volume.js', () => ({
  analyzeVolume: vi.fn(() => ({
    avgVolume: new Big(1000000),
    currentVolume: new Big(1500000),
    volumeRatio: new Big(1.5),
    isHighVolume: true,
  })),
}));

vi.mock('../../indicators/support-resistance.js', () => ({
  findSupportResistanceLevels: vi.fn(() => [
    { price: new Big(95), type: 'support', strength: 0.8, touches: 3 },
    { price: new Big(105), type: 'resistance', strength: 0.7, touches: 2 },
  ]),
}));

vi.mock('../../atr/calculator.js', () => ({
  calculateATR: vi.fn(() => ({
    atr: new Big(2.5),
    values: [],
  })),
}));

describe('fetchCandles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCandleData = [
    {
      candle_time: '2026-02-15T10:03:00Z',
      open: 102,
      high: 103,
      low: 101,
      close: 102.5,
      volume: 1500,
    },
    {
      candle_time: '2026-02-15T10:02:00Z',
      open: 101,
      high: 102,
      low: 100,
      close: 101.5,
      volume: 1200,
    },
    {
      candle_time: '2026-02-15T10:01:00Z',
      open: 100,
      high: 101,
      low: 99,
      close: 100.5,
      volume: 1000,
    },
  ];

  it('캔들 데이터를 정상적으로 조회해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await fetchCandles({
      market: 'KRX',
      symbol: '005930',
      limit: 100,
    });

    expect(result).toHaveLength(3);
    expect(mockSupabase.from).toHaveBeenCalledWith('kis_candles');
    expect(mockSupabase.eq).toHaveBeenCalledWith('symbol', '005930');
  });

  it('캔들을 시간순으로 정렬해야 함 (오래된 것부터)', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData, // DB에서는 최신순
      error: null,
    });

    const result = await fetchCandles({
      market: 'US',
      symbol: 'AAPL',
    });

    // 반환값은 오래된 것부터 (reverse됨)
    expect(result[0].close).toBe(100.5);
    expect(result[1].close).toBe(101.5);
    expect(result[2].close).toBe(102.5);
  });

  it('CRYPTO 마켓일 때 심볼을 변환해야 함 (BTC -> KRW-BTC)', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    await fetchCandles({
      market: 'CRYPTO',
      symbol: 'BTC',
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('upbit_candles');
    expect(mockSupabase.eq).toHaveBeenCalledWith('market', 'KRW-BTC');
  });

  it('CRYPTO 마켓에서 이미 KRW- 접두사가 있으면 변환하지 않아야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    await fetchCandles({
      market: 'CRYPTO',
      symbol: 'KRW-BTC',
    });

    expect(mockSupabase.eq).toHaveBeenCalledWith('market', 'KRW-BTC');
  });

  it('캔들 데이터가 없으면 빈 배열을 반환해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await fetchCandles({
      market: 'US',
      symbol: 'UNKNOWN',
    });

    expect(result).toEqual([]);
  });

  it('DB 에러 시 에러를 throw해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: null,
      error: { message: 'Connection failed' },
    });

    await expect(
      fetchCandles({
        market: 'KRX',
        symbol: '005930',
      })
    ).rejects.toThrow('캔들 데이터 조회 실패');
  });

  it('기본 limit은 200이어야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    await fetchCandles({
      market: 'US',
      symbol: 'AAPL',
    });

    expect(mockSupabase.limit).toHaveBeenCalledWith(200);
  });

  it('사용자 정의 limit을 적용해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    await fetchCandles({
      market: 'US',
      symbol: 'AAPL',
      limit: 50,
    });

    expect(mockSupabase.limit).toHaveBeenCalledWith(50);
  });

  it('US 마켓은 yf_candles 테이블을 사용해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    await fetchCandles({
      market: 'US',
      symbol: 'AAPL',
    });

    expect(mockSupabase.from).toHaveBeenCalledWith('yf_candles');
    expect(mockSupabase.eq).toHaveBeenCalledWith('symbol', 'AAPL');
  });
});

describe('analyzeTechnicalIndicators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCandleData = Array.from({ length: 100 }, (_, i) => ({
    candle_time: `2026-02-15T${String(10 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00Z`,
    open: 100 + i,
    high: 101 + i,
    low: 99 + i,
    close: 100 + i + 0.5,
    volume: 1000 + i * 10,
  }));

  it('모든 기술적 지표를 계산해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'CRYPTO',
      symbol: 'BTC',
    });

    expect(result.sma20).toBeDefined();
    expect(result.ema20).toBeDefined();
    expect(result.macd).toBeDefined();
    expect(result.rsi).toBeDefined();
    expect(result.volume).toBeDefined();
    expect(result.supportResistance).toBeDefined();
    expect(result.atr).toBeDefined();
    expect(result.currentPrice).toBeDefined();
    expect(result.calculatedAt).toBeDefined();
  });

  it('현재가는 마지막 캔들의 종가여야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'US',
      symbol: 'AAPL',
    });

    // mockCandleData는 최신순이므로 reverse 후 마지막 = 원래 첫번째
    const lastCandle = mockCandleData[0];
    expect(result.currentPrice.toNumber()).toBe(lastCandle.close);
  });

  it('캔들 데이터가 50개 미만이면 에러를 throw해야 함', async () => {
    const fewCandles = mockCandleData.slice(0, 30);
    mockSupabase.limit.mockResolvedValue({
      data: fewCandles,
      error: null,
    });

    await expect(
      analyzeTechnicalIndicators({
        market: 'KRX',
        symbol: '005930',
      })
    ).rejects.toThrow('캔들 데이터 부족');
  });

  it('모든 지표가 null이거나 빈 배열이어도 결과를 반환해야 함', async () => {
    // 최소한의 캔들 데이터
    const minimalCandles = Array.from({ length: 60 }, (_, i) => ({
      candle_time: `2026-02-15T10:${String(i).padStart(2, '0')}:00Z`,
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1000,
    }));

    mockSupabase.limit.mockResolvedValue({
      data: minimalCandles,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'US',
      symbol: 'AAPL',
    });

    // 최소한 currentPrice와 calculatedAt는 있어야 함
    expect(result.currentPrice).toBeDefined();
    expect(result.calculatedAt).toBeDefined();
  });

  it('계산 시각이 ISO 8601 형식이어야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'CRYPTO',
      symbol: 'ETH',
    });

    expect(result.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('지지/저항 레벨이 배열이어야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'KRX',
      symbol: '005930',
    });

    expect(Array.isArray(result.supportResistance)).toBe(true);

    // 모킹된 함수가 반환하는 경우에만 검증
    if (result.supportResistance.length > 0) {
      expect(result.supportResistance[0]).toHaveProperty('price');
      expect(result.supportResistance[0]).toHaveProperty('type');
      expect(result.supportResistance[0]).toHaveProperty('strength');
      expect(result.supportResistance[0]).toHaveProperty('touches');
    }
  });

  it('MACD 결과는 macd, signal, histogram을 포함해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'US',
      symbol: 'TSLA',
    });

    expect(result.macd).toBeDefined();
    expect(result.macd?.macd).toBeDefined();
    expect(result.macd?.signal).toBeDefined();
    expect(result.macd?.histogram).toBeDefined();
  });

  it('RSI 결과는 value, overbought, oversold를 포함해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'CRYPTO',
      symbol: 'SOL',
    });

    expect(result.rsi).toBeDefined();
    expect(result.rsi?.value).toBeDefined();
    expect(typeof result.rsi?.overbought).toBe('boolean');
    expect(typeof result.rsi?.oversold).toBe('boolean');
  });

  it('거래량 분석 결과는 모든 필드를 포함해야 함', async () => {
    mockSupabase.limit.mockResolvedValue({
      data: mockCandleData,
      error: null,
    });

    const result = await analyzeTechnicalIndicators({
      market: 'KRX',
      symbol: '000660',
    });

    expect(result.volume).toBeDefined();
    expect(result.volume?.avgVolume).toBeDefined();
    expect(result.volume?.currentVolume).toBeDefined();
    expect(result.volume?.volumeRatio).toBeDefined();
    expect(typeof result.volume?.isHighVolume).toBe('boolean');
  });
});
