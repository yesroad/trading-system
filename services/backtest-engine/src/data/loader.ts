import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import Big from 'big.js';
import type { Candle, CandleRaw } from '../types.js';

const logger = createLogger('data-loader');

/**
 * DB에서 캔들 데이터 로드
 *
 * @param params.symbol - 심볼
 * @param params.startDate - 시작 날짜 (ISO)
 * @param params.endDate - 종료 날짜 (ISO)
 * @param params.source - 데이터 소스 ('upbit' | 'kis' | 'yf')
 * @returns 캔들 배열
 */
export async function loadCandles(params: {
  symbol: string;
  startDate: string;
  endDate: string;
  source: 'upbit' | 'kis' | 'yf';
}): Promise<Candle[]> {
  const { symbol, startDate, endDate, source } = params;

  const tableName = `${source}_candles`;
  const supabase = getSupabase();

  logger.info('캔들 데이터 로드 시작', { symbol, startDate, endDate, source });

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('symbol', symbol)
    .gte('candle_time', startDate)
    .lte('candle_time', endDate)
    .order('candle_time', { ascending: true });

  if (error) {
    logger.error('캔들 데이터 로드 실패', { error });
    throw new Error(`캔들 데이터 로드 실패: ${error.message}`);
  }

  if (!data || data.length === 0) {
    logger.warn('캔들 데이터 없음', { symbol, startDate, endDate });
    return [];
  }

  logger.info('캔들 데이터 로드 완료', { count: data.length });

  // DB 결과를 Candle 타입으로 변환
  return data.map((row: CandleRaw) => ({
    symbol: row.symbol,
    candleTime: row.candle_time,
    open: new Big(row.open),
    high: new Big(row.high),
    low: new Big(row.low),
    close: new Big(row.close),
    volume: new Big(row.volume),
  }));
}

/**
 * 평균 거래량 계산
 *
 * @param candles - 캔들 배열
 * @param period - 기간 (기본: 20일)
 * @returns 평균 거래량
 */
export function calculateAvgVolume(candles: Candle[], period = 20): Big {
  if (candles.length === 0) {
    return new Big(0);
  }

  const recentCandles = candles.slice(-period);
  const totalVolume = recentCandles.reduce(
    (sum, candle) => sum.plus(candle.volume),
    new Big(0)
  );

  return totalVolume.div(recentCandles.length);
}

/**
 * 호가 스프레드 추정 (간단 버전)
 *
 * @param candles - 캔들 배열
 * @returns 스프레드 비율 (%)
 */
export function estimateBidAskSpread(candles: Candle[]): Big {
  if (candles.length === 0) {
    return new Big(0.1); // 기본값 0.1%
  }

  // 최근 캔들의 (고가 - 저가) / 종가 평균
  const recentCandles = candles.slice(-10);
  const avgSpread = recentCandles.reduce((sum, candle) => {
    const spread = candle.high.minus(candle.low).div(candle.close);
    return sum.plus(spread);
  }, new Big(0));

  return avgSpread.div(recentCandles.length).times(100); // %로 변환
}
