export type UpbitMarket = {
  market: string; // "KRW-BTC"
  korean_name: string;
  english_name: string;
};

export type UpbitTicker = {
  market: string;
  trade_price: number | null;
  acc_trade_price_24h: number; // 24시간 누적 거래대금
  acc_trade_volume_24h: number; // 24시간 누적 거래량
  signed_change_rate: number | null;
  timestamp: number;
};

export type UpbitMinuteCandle = {
  market: string;
  candle_date_time_kst: string; // "2026-01-24T12:34:00"
  candle_date_time_utc: string;
  opening_price: number;
  high_price: number;
  low_price: number;
  trade_price: number;
  candle_acc_trade_price: number;
  candle_acc_trade_volume: number;
  unit: number; // minutes unit (1,3,5,...)
  timestamp: number;
};
