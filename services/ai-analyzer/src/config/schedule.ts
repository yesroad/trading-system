import { Market, MARKET_CONFIG } from './markets';
import { DateTime } from 'luxon';

export const MARKET_MODES = [
  'PRE_OPEN', // 장 열리기 전 체크
  'INTRADAY', // 장중 실시간 분석
  'CLOSE', // 장 마감 직전 리스크/정리 판단
  'POST_CLOSE', // 장 마감 후
  'OFF', //장외
  'CRYPTO', // 24/7 장중
  'CRYPTO_DAILY', //하루 1번 요약(선택)
] as const;

export type MarketMode = (typeof MARKET_MODES)[number];

/** ===============================
 * 내부 유틸: 특정 timezone의 시/분을 뽑는다
 * =============================== */
function getTimeInZone(now: DateTime, timeZone: string): { hour: number; minute: number; dow: number } {
  const dt = now.setZone(timeZone);
  // luxon: weekday 1(Mon)~7(Sun) -> 0(Sun)~6(Sat)
  const dow = dt.weekday % 7;
  return { hour: dt.hour, minute: dt.minute, dow };
}

function toMin(hour: number, minute: number): number {
  return hour * 60 + minute;
}

function inRange(nowMin: number, startMin: number, endMin: number): boolean {
  // [start, end)
  return nowMin >= startMin && nowMin < endMin;
}

/** ===============================
 * 시장별 “시간 창” 정의
 * - 너무 촘촘하게 잡지 말고, 비용을 위해 "창"으로 처리
 * =============================== */
type TimeWindows = {
  preOpen: { start: number; end: number };
  intraday: { start: number; end: number };
  close: { start: number; end: number };
  postClose: { start: number; end: number };
};

const KR_WINDOWS: TimeWindows = {
  // KST 기준
  preOpen: { start: toMin(8, 30), end: toMin(9, 0) }, // 08:30~09:00
  intraday: { start: toMin(9, 0), end: toMin(15, 20) }, // 09:00~15:20
  close: { start: toMin(15, 20), end: toMin(15, 30) }, // 15:20~15:30 (마감 직전)
  postClose: { start: toMin(15, 30), end: toMin(16, 0) }, // 15:30~16:00 (정리/리포트용)
};

const US_WINDOWS: TimeWindows = {
  // 뉴욕 시간(ET) 기준
  preOpen: { start: toMin(8, 30), end: toMin(9, 30) }, // 08:30~09:30
  intraday: { start: toMin(9, 30), end: toMin(15, 50) }, // 09:30~15:50
  close: { start: toMin(15, 50), end: toMin(16, 0) }, // 15:50~16:00
  postClose: { start: toMin(16, 0), end: toMin(16, 30) }, // 16:00~16:30
};

/** ===============================
 * CRYPTO(Upbit)용 “하루 1회 요약 창”
 * - 코인은 24/7 이라 mode는 기본 CRYPTO
 * - 대신 하루에 한 번 요약(옵션)하려고 창을 둠
 * =============================== */
const CRYPTO_DAILY_WINDOW_UTC = {
  start: toMin(0, 0), // 00:00 UTC
  end: toMin(0, 5), // 00:05 UTC (5분 창)
};

/** ===============================
 * 주말/휴장 처리
 * - KR/US는 “기본적으로” 토/일 OFF 처리
 * - (한국 공휴일/미국 휴장일 같은 건 다음 단계에서 캘린더로 보강 가능)
 * =============================== */
function isWeekend(dow: number): boolean {
  return dow === 0 || dow === 6;
}

/** ===============================
 * 외부 공개: 지금 시각 기준 시장 모드 결정
 * =============================== */
export function getMarketMode(market: Market, now: DateTime = DateTime.now()): MarketMode {
  const tz = MARKET_CONFIG[market].timezone;

  // CRYPTO는 장 개념이 없음
  if (market === Market.CRYPTO) {
    const { hour, minute } = getTimeInZone(now, 'UTC');
    const nowMin = toMin(hour, minute);

    // 하루 1회 요약 모드(옵션)
    if (inRange(nowMin, CRYPTO_DAILY_WINDOW_UTC.start, CRYPTO_DAILY_WINDOW_UTC.end)) {
      return 'CRYPTO_DAILY';
    }

    return 'CRYPTO';
  }

  // KR/US: 주말이면 OFF
  const { hour, minute, dow } = getTimeInZone(now, tz);
  if (isWeekend(dow)) return 'OFF';

  const nowMin = toMin(hour, minute);
  const windows = market === Market.KR ? KR_WINDOWS : US_WINDOWS;

  if (inRange(nowMin, windows.preOpen.start, windows.preOpen.end)) return 'PRE_OPEN';
  if (inRange(nowMin, windows.intraday.start, windows.intraday.end)) return 'INTRADAY';
  if (inRange(nowMin, windows.close.start, windows.close.end)) return 'CLOSE';
  if (inRange(nowMin, windows.postClose.start, windows.postClose.end)) return 'POST_CLOSE';

  return 'OFF';
}

/** ===============================
 * 편의 함수들
 * =============================== */
export function isMarketActive(mode: MarketMode): boolean {
  return mode === 'INTRADAY' || mode === 'CLOSE' || mode === 'CRYPTO';
}

export function isPreOrClose(mode: MarketMode): boolean {
  return (
    mode === 'PRE_OPEN' || mode === 'CLOSE' || mode === 'POST_CLOSE' || mode === 'CRYPTO_DAILY'
  );
}

/**
 * LLM 호출 타이밍을 "모드" 관점에서 1차 필터링할 때 사용
 * - 실제 호출 여부는 shouldCallAI(쿨다운/횟수 제한)에서 2차로 결정
 */
export function shouldConsiderAi(mode: MarketMode): boolean {
  // 기본적으로 “장중 + 장전/장마감 + 크립토(상시)”에서만 고려
  return (
    mode === 'PRE_OPEN' ||
    mode === 'INTRADAY' ||
    mode === 'CLOSE' ||
    mode === 'POST_CLOSE' ||
    mode === 'CRYPTO' ||
    mode === 'CRYPTO_DAILY'
  );
}
