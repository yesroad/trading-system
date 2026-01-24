import type { UpbitTicker } from './types/upbit';

export function pickTopNByTradePrice24h(tickers: UpbitTicker[], topN: number): UpbitTicker[] {
  const filtered = tickers
    .filter((t) => t.market.startsWith('KRW-'))
    .filter((t) => Number.isFinite(t.acc_trade_price_24h) && t.acc_trade_price_24h > 0);

  filtered.sort((a, b) => b.acc_trade_price_24h - a.acc_trade_price_24h);

  return filtered.slice(0, topN);
}
