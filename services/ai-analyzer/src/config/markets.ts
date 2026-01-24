/** ===============================
 * Market 식별자
 * =============================== */
export enum Market {
  KR = 'KR',
  US = 'US',
  CRYPTO = 'CRYPTO',
}

/** ===============================
 * 시장별 기본 성격 정의
 * =============================== */
export type MarketConfig = {
  label: string; // 사람이 읽는 이름
  hasTradingHours: boolean; // 장 개념 존재 여부
  timezone: string; // 기준 타임존
  description: string; // 운영/문서용 설명
};

/** ===============================
 * 시장 설정 맵
 * =============================== */
export const MARKET_CONFIG: Record<Market, MarketConfig> = {
  [Market.KR]: {
    label: '국내 주식',
    hasTradingHours: true,
    timezone: 'Asia/Seoul',
    description: 'KOSPI / KOSDAQ 종목 분석',
  },

  [Market.US]: {
    label: '미국 주식',
    hasTradingHours: true,
    timezone: 'America/New_York',
    description: 'NYSE / NASDAQ 종목 분석',
  },

  [Market.CRYPTO]: {
    label: '암호화폐',
    hasTradingHours: false,
    timezone: 'UTC',
    description: 'Upbit 기준 KRW 마켓 암호화폐 분석',
  },
};

/** ===============================
 * 유틸 함수
 * =============================== */
export function isCryptoMarket(market: Market): boolean {
  return market === Market.CRYPTO;
}

export function hasTradingHours(market: Market): boolean {
  return MARKET_CONFIG[market].hasTradingHours;
}
