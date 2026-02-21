import Big from 'big.js';
import { getSupabase } from '@workspace/db-client';
import { createLogger, nowIso } from '@workspace/shared-utils';
import {
  calculateMA,
  calculateMACD,
  calculateRSI,
  analyzeVolume,
  findSupportResistanceLevels,
  calculateATR,
  type Candle,
} from '@workspace/trading-utils';
import type { Market, TechnicalSnapshot } from './types.js';

const logger = createLogger('technical-analyzer');

/**
 * 시장별 캔들 조회 소스 매핑
 * - 운영 스키마 차이를 흡수하기 위해 시장별 다중 소스를 허용한다.
 */
type CandleSource = {
  table: string;
  symbolColumn: string;
  timeColumn: string;
};

const CANDLE_SOURCES: Record<Market, CandleSource[]> = {
  CRYPTO: [
    { table: 'upbit_candles', symbolColumn: 'market', timeColumn: 'candle_time_utc' },
    { table: 'upbit_candles', symbolColumn: 'market', timeColumn: 'candle_time' },
  ],
  KRX: [{ table: 'kis_candles', symbolColumn: 'symbol', timeColumn: 'candle_time' }],
  US: [
    { table: 'yf_candles', symbolColumn: 'symbol', timeColumn: 'candle_time' },
    { table: 'equity_bars', symbolColumn: 'symbol', timeColumn: 'ts' },
  ],
};

/**
 * 캔들 데이터 조회
 *
 * @param params - 조회 파라미터
 * @returns 캔들 배열 (최신순)
 */
export async function fetchCandles(params: {
  market: Market;
  symbol: string;
  limit?: number;
}): Promise<Candle[]> {
  const supabase = getSupabase();
  const limit = params.limit ?? 200;
  const sources = CANDLE_SOURCES[params.market];

  // CRYPTO 마켓은 심볼 형식 변환 (BTC -> KRW-BTC)
  let symbolValue = params.symbol;
  if (params.market === 'CRYPTO' && !params.symbol.startsWith('KRW-')) {
    symbolValue = `KRW-${params.symbol}`;
  }

  let lastErrorMessage: string | null = null;

  for (const source of sources) {
    const { data, error } = await supabase
      .from(source.table)
      .select(`${source.timeColumn},open,high,low,close,volume`)
      .eq(source.symbolColumn, symbolValue)
      .order(source.timeColumn, { ascending: false })
      .limit(limit);

    if (error) {
      lastErrorMessage = `${source.table}.${source.timeColumn}: ${error.message}`;
      logger.warn('캔들 데이터 조회 소스 실패', {
        market: params.market,
        symbol: params.symbol,
        table: source.table,
        timeColumn: source.timeColumn,
        error,
      });
      continue;
    }

    if (!data || data.length === 0) {
      logger.info('캔들 데이터 소스 비어있음', {
        market: params.market,
        symbol: params.symbol,
        table: source.table,
        timeColumn: source.timeColumn,
      });
      continue;
    }

    const candles: Candle[] = data
      .map((row: unknown) => {
        const r = row as Record<string, unknown>;
        const time = String(r[source.timeColumn] ?? '').trim();
        return {
          time,
          open: r.open as string | number,
          high: r.high as string | number,
          low: r.low as string | number,
          close: r.close as string | number,
          volume: r.volume as string | number,
        };
      })
      .filter((row) => row.time.length > 0);

    if (candles.length === 0) {
      continue;
    }

    // 최신순으로 정렬되어 있으므로 역순으로 변환 (오래된 것부터)
    return candles.reverse();
  }

  if (lastErrorMessage) {
    throw new Error(`캔들 데이터 조회 실패: ${lastErrorMessage}`);
  }

  logger.warn('캔들 데이터 없음', { market: params.market, symbol: params.symbol });
  return [];
}

/**
 * 기술적 지표 분석
 *
 * 캔들 데이터를 기반으로 모든 기술적 지표를 계산합니다.
 *
 * @param params - 분석 파라미터
 * @returns 기술적 지표 스냅샷
 */
export async function analyzeTechnicalIndicators(params: {
  market: Market;
  symbol: string;
}): Promise<TechnicalSnapshot> {
  logger.info('기술적 지표 분석 시작', { market: params.market, symbol: params.symbol });

  // 1. 캔들 데이터 조회 (최소 200개)
  const candles = await fetchCandles({
    market: params.market,
    symbol: params.symbol,
    limit: 200,
  });

  if (candles.length < 50) {
    logger.warn('캔들 데이터 부족', {
      market: params.market,
      symbol: params.symbol,
      count: candles.length,
    });
    throw new Error(`캔들 데이터 부족: ${candles.length}개 (최소 50개 필요)`);
  }

  // 현재가 (마지막 캔들의 종가)
  const currentPrice = new Big(candles[candles.length - 1].close);

  // 2. 이동평균 계산
  let sma20: Big | null = null;
  let ema20: Big | null = null;

  try {
    sma20 = calculateMA(candles, 20, 'SMA');
    logger.debug('SMA20 계산 완료', { value: sma20.toString() });
  } catch (error) {
    logger.warn('SMA20 계산 실패', { error });
  }

  try {
    ema20 = calculateMA(candles, 20, 'EMA');
    logger.debug('EMA20 계산 완료', { value: ema20.toString() });
  } catch (error) {
    logger.warn('EMA20 계산 실패', { error });
  }

  // 3. MACD 계산
  let macd: TechnicalSnapshot['macd'] = null;
  try {
    const macdResult = calculateMACD(candles);
    macd = {
      macd: macdResult.macd,
      signal: macdResult.signal,
      histogram: macdResult.histogram,
    };
    logger.debug('MACD 계산 완료', {
      macd: macd.macd.toString(),
      signal: macd.signal.toString(),
      histogram: macd.histogram.toString(),
    });
  } catch (error) {
    logger.warn('MACD 계산 실패', { error });
  }

  // 4. RSI 계산
  let rsi: TechnicalSnapshot['rsi'] = null;
  try {
    const rsiResult = calculateRSI(candles);
    rsi = {
      value: rsiResult.value,
      overbought: rsiResult.overbought,
      oversold: rsiResult.oversold,
    };
    logger.debug('RSI 계산 완료', {
      value: rsi.value.toString(),
      overbought: rsi.overbought,
      oversold: rsi.oversold,
    });
  } catch (error) {
    logger.warn('RSI 계산 실패', { error });
  }

  // 5. 거래량 분석
  let volume: TechnicalSnapshot['volume'] = null;
  try {
    const volumeResult = analyzeVolume(candles);
    volume = {
      avgVolume: volumeResult.avgVolume,
      currentVolume: volumeResult.currentVolume,
      volumeRatio: volumeResult.volumeRatio,
      isHighVolume: volumeResult.isHighVolume,
    };
    logger.debug('거래량 분석 완료', {
      avgVolume: volume.avgVolume.toString(),
      currentVolume: volume.currentVolume.toString(),
      volumeRatio: volume.volumeRatio.toString(),
      isHighVolume: volume.isHighVolume,
    });
  } catch (error) {
    logger.warn('거래량 분석 실패', { error });
  }

  // 6. 지지/저항 레벨 계산
  let supportResistance: TechnicalSnapshot['supportResistance'] = [];
  try {
    supportResistance = findSupportResistanceLevels(candles);
    logger.debug('지지/저항 레벨 계산 완료', { count: supportResistance.length });
  } catch (error) {
    logger.warn('지지/저항 레벨 계산 실패', { error });
  }

  // 7. ATR 계산
  let atr: Big | null = null;
  try {
    const atrResult = calculateATR(candles, 14);
    atr = atrResult.atr;
    logger.debug('ATR 계산 완료', { value: atr.toString() });
  } catch (error) {
    logger.warn('ATR 계산 실패', { error });
  }

  const snapshot: TechnicalSnapshot = {
    sma20,
    ema20,
    macd,
    rsi,
    volume,
    supportResistance,
    atr,
    currentPrice,
    calculatedAt: nowIso(),
  };

  logger.info('기술적 지표 분석 완료', {
    market: params.market,
    symbol: params.symbol,
    currentPrice: currentPrice.toString(),
    indicatorsCalculated: {
      sma20: sma20 !== null,
      ema20: ema20 !== null,
      macd: macd !== null,
      rsi: rsi !== null,
      volume: volume !== null,
      supportResistance: supportResistance.length > 0,
      atr: atr !== null,
    },
  });

  return snapshot;
}
