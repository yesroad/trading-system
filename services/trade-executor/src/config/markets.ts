import { env } from '@workspace/shared-utils';

export const BROKERS = ['KIS', 'UPBIT'] as const;
export type Broker = (typeof BROKERS)[number];

export const MARKETS = ['KR', 'US', 'CRYPTO'] as const;
export type Market = (typeof MARKETS)[number];

const MARKET_TO_BROKER: Record<Market, Broker> = {
  KR: 'KIS',
  US: 'KIS',
  CRYPTO: 'UPBIT',
};

export function isMarket(value: string): value is Market {
  return (MARKETS as readonly string[]).includes(value);
}

export function marketToBroker(market: Market): Broker {
  return MARKET_TO_BROKER[market];
}

/**
 * EXECUTE_MARKETS 예시: "CRYPTO,KR,US"
 * - 비어있거나 누락이면 전체 시장 기본값 사용
 * - 잘못된 값이 있으면 에러 발생
 */
export function parseExecuteMarkets(raw: string | undefined): Market[] {
  if (!raw || raw.trim().length === 0) {
    return [...MARKETS];
  }

  const parsed = raw
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter((m) => m.length > 0);

  const invalid = parsed.filter((m) => !isMarket(m));
  if (invalid.length > 0) {
    throw new Error(`Invalid EXECUTE_MARKETS value(s): ${invalid.join(', ')}`);
  }

  const unique = Array.from(new Set(parsed)) as Market[];
  return unique.length > 0 ? unique : [...MARKETS];
}

export const EXECUTE_MARKETS: Market[] = parseExecuteMarkets(env('EXECUTE_MARKETS'));
