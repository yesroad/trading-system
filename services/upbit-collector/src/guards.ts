import type { UpbitMarket, UpbitTicker, UpbitMinuteCandle } from './types/upbit.js';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNullableNumber(v: unknown): v is number | null {
  return v === null || isNumber(v);
}

export function parseMarkets(input: unknown): UpbitMarket[] {
  if (!Array.isArray(input)) throw new Error('업비트 마켓 응답 형식이 예상과 다릅니다.');
  const out: UpbitMarket[] = [];

  for (const row of input) {
    if (!isRecord(row)) continue;
    const market = row.market;
    const korean_name = row.korean_name;
    const english_name = row.english_name;

    if (isString(market) && isString(korean_name) && isString(english_name)) {
      out.push({ market, korean_name, english_name });
    }
  }

  if (out.length === 0) {
    throw new Error('업비트 마켓 목록 파싱 결과가 비었습니다.');
  }
  return out;
}

export function parseTickers(input: unknown): UpbitTicker[] {
  if (!Array.isArray(input)) throw new Error('업비트 티커 응답 형식이 예상과 다릅니다.');
  const out: UpbitTicker[] = [];

  for (const row of input) {
    if (!isRecord(row)) continue;

    const market = row.market;
    const trade_price = row.trade_price;
    const acc_trade_price_24h = row.acc_trade_price_24h;
    const acc_trade_volume_24h = row.acc_trade_volume_24h;
    const signed_change_rate = row.signed_change_rate;
    const timestamp = row.timestamp;

    if (
      isString(market) &&
      isNullableNumber(trade_price) &&
      isNumber(acc_trade_price_24h) &&
      isNumber(acc_trade_volume_24h) &&
      (signed_change_rate === null || isNumber(signed_change_rate)) &&
      isNumber(timestamp)
    ) {
      out.push({
        market,
        trade_price,
        acc_trade_price_24h,
        acc_trade_volume_24h,
        signed_change_rate,
        timestamp,
      });
    }
  }

  if (out.length === 0) {
    throw new Error('업비트 티커 파싱 결과가 비었습니다.');
  }
  return out;
}

export function parseMinuteCandles(input: unknown): UpbitMinuteCandle[] {
  if (!Array.isArray(input)) throw new Error('업비트 캔들 응답 형식이 예상과 다릅니다.');
  const out: UpbitMinuteCandle[] = [];

  for (const row of input) {
    if (!isRecord(row)) continue;

    const market = row.market;
    const candle_date_time_kst = row.candle_date_time_kst;
    const candle_date_time_utc = row.candle_date_time_utc;
    const opening_price = row.opening_price;
    const high_price = row.high_price;
    const low_price = row.low_price;
    const trade_price = row.trade_price;
    const candle_acc_trade_price = row.candle_acc_trade_price;
    const candle_acc_trade_volume = row.candle_acc_trade_volume;
    const unit = row.unit;
    const timestamp = row.timestamp;

    if (
      isString(market) &&
      isString(candle_date_time_kst) &&
      isString(candle_date_time_utc) &&
      isNumber(opening_price) &&
      isNumber(high_price) &&
      isNumber(low_price) &&
      isNumber(trade_price) &&
      isNumber(candle_acc_trade_price) &&
      isNumber(candle_acc_trade_volume) &&
      isNumber(unit) &&
      isNumber(timestamp)
    ) {
      out.push({
        market,
        candle_date_time_kst,
        candle_date_time_utc,
        opening_price,
        high_price,
        low_price,
        trade_price,
        candle_acc_trade_price,
        candle_acc_trade_volume,
        unit,
        timestamp,
      });
    }
  }

  if (out.length === 0) {
    throw new Error('업비트 캔들 파싱 결과가 비었습니다.');
  }
  return out;
}
