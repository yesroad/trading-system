import { parseMarkets, parseTickers, parseMinuteCandles } from './guards.js';
import type { UpbitMarket, UpbitTicker, UpbitMinuteCandle } from './types/upbit.js';
import { requireEnv as env } from '@workspace/shared-utils';
import Big from 'big.js';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const BASE_URL = 'https://api.upbit.com/v1';

export type UpbitAccount = {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
  avg_buy_price_modified: boolean;
  unit_currency: string;
};

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

/**
 * Upbit 계좌 조회 (인증 필요)
 * @returns KRW 잔액 포함 전체 계좌 정보
 */
export async function fetchAccounts(): Promise<UpbitAccount[]> {
  const accessKey = env('UPBIT_ACCESS_KEY');
  const secretKey = env('UPBIT_SECRET_KEY');

  const payload = {
    access_key: accessKey,
    nonce: uuidv4(),
  };

  const token = jwt.sign(payload, secretKey);

  const res = await fetch(`${BASE_URL}/accounts`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`업비트 계좌 조회 실패: ${res.status} ${res.statusText} ${text}`);
  }

  const data = await res.json();

  if (!Array.isArray(data)) {
    throw new Error('업비트 계좌 조회 응답 형식 오류');
  }

  return data as UpbitAccount[];
}

/**
 * KRW 잔액 조회
 * @returns KRW 사용 가능 잔액 (balance - locked)
 */
export async function fetchKRWBalance(): Promise<number> {
  const accounts = await fetchAccounts();
  const krwAccount = accounts.find((a) => a.currency === 'KRW');

  if (!krwAccount) {
    return 0;
  }

  let available: Big;
  try {
    const balance = new Big(krwAccount.balance);
    const locked = new Big(krwAccount.locked);
    available = balance.minus(locked);
  } catch {
    throw new Error('KRW 잔액 파싱 실패');
  }

  if (available.lt(0)) {
    return 0;
  }

  const availableNumber = Number(available.toString());
  if (!Number.isFinite(availableNumber)) {
    throw new Error('KRW 잔액 변환 실패');
  }

  return availableNumber;
}
