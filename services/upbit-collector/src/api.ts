import { parseMarkets, parseTickers, parseMinuteCandles } from './guards';
import type { UpbitMarket, UpbitTicker, UpbitMinuteCandle } from './types/upbit';

const BASE_URL = 'https://api.upbit.com/v1';

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`업비트 API 요청 실패: ${res.status} ${res.statusText} ${text}`);
  }

  // node-fetch 쓰면 json()이 unknown으로 잡히는 경우가 있어서,
  // 우리는 Node 내장 fetch 기준 + unknown -> guard 파싱으로 처리한다.
  return await res.json();
}

export async function fetchAllMarkets(): Promise<UpbitMarket[]> {
  const raw = await fetchJson(`${BASE_URL}/market/all?isDetails=false`);
  const markets = parseMarkets(raw);
  return markets.filter((m) => m.market.startsWith('KRW-'));
}

/**
 * 업비트 ticker는 markets 파라미터를 콤마로 묶어서 전달.
 * 요청 길이/제한 때문에 배치로 나눠 호출한다.
 */
export async function fetchTickers(markets: string[]): Promise<UpbitTicker[]> {
  if (markets.length === 0) return [];

  // 경험적으로 100개 정도 단위로 쪼개면 안전
  const batchSize = 100;
  const all: UpbitTicker[] = [];

  for (let i = 0; i < markets.length; i += batchSize) {
    const batch = markets.slice(i, i + batchSize);
    const qs = encodeURIComponent(batch.join(','));
    const raw = await fetchJson(`${BASE_URL}/ticker?markets=${qs}`);
    const parsed = parseTickers(raw);
    all.push(...parsed);
  }

  return all;
}

/**
 * timeframe 예: "1m" -> minutes/1
 */
export async function fetchMinuteCandles(params: {
  market: string;
  unit: number; // 1,3,5...
  count: number; // up to 200
}): Promise<UpbitMinuteCandle[]> {
  const { market, unit, count } = params;
  const raw = await fetchJson(
    `${BASE_URL}/candles/minutes/${unit}?market=${encodeURIComponent(market)}&count=${count}`,
  );
  // 업비트 캔들은 최신이 앞에 옴
  return parseMinuteCandles(raw);
}
