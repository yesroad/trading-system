import Big from 'big.js';
import type { Candle, SupportResistanceLevel } from '../types.js';

/**
 * 간단한 지지/저항선 찾기 (피봇 포인트 기반)
 *
 * @param candles - OHLCV 캔들 배열
 * @param lookback - 탐색 기간 (기본값: 20)
 * @returns 지지/저항선 배열
 *
 * @example
 * ```typescript
 * const levels = findSupportResistanceLevels(candles, 20);
 *
 * levels.forEach(level => {
 *   console.log(`${level.type}: ${level.price.toString()} (강도: ${level.strength})`);
 * });
 * ```
 */
export function findSupportResistanceLevels(
  candles: Candle[],
  lookback = 20
): SupportResistanceLevel[] {
  if (candles.length < lookback * 2 + 1) {
    return [];
  }

  const levels: SupportResistanceLevel[] = [];

  // 피봇 하이/로우 찾기
  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = new Big(candles[i].high);
    const currentLow = new Big(candles[i].low);

    // 저항선: 양쪽 lookback 기간 내에서 가장 높은 고가
    const leftHighs = candles.slice(i - lookback, i).map((c) => new Big(c.high));
    const rightHighs = candles.slice(i + 1, i + lookback + 1).map((c) => new Big(c.high));

    const isResistance = leftHighs.every((h) => current.gte(h)) && rightHighs.every((h) => current.gte(h));

    if (isResistance) {
      levels.push({
        price: current,
        type: 'resistance',
        strength: 0.5, // 간단한 구현: 고정값
        touches: 1,
      });
    }

    // 지지선: 양쪽 lookback 기간 내에서 가장 낮은 저가
    const leftLows = candles.slice(i - lookback, i).map((c) => new Big(c.low));
    const rightLows = candles.slice(i + 1, i + lookback + 1).map((c) => new Big(c.low));

    const isSupport = leftLows.every((l) => currentLow.lte(l)) && rightLows.every((l) => currentLow.lte(l));

    if (isSupport) {
      levels.push({
        price: currentLow,
        type: 'support',
        strength: 0.5,
        touches: 1,
      });
    }
  }

  // 가까운 레벨끼리 병합 (가격 차이가 2% 이내)
  const merged = mergeSimilarLevels(levels, 0.02);

  return merged;
}

/**
 * 유사한 레벨 병합
 */
function mergeSimilarLevels(
  levels: SupportResistanceLevel[],
  threshold: number
): SupportResistanceLevel[] {
  if (levels.length === 0) return [];

  const merged: SupportResistanceLevel[] = [];

  for (const level of levels) {
    const similar = merged.find(
      (m) =>
        m.type === level.type &&
        level.price.minus(m.price).abs().div(m.price).lt(threshold)
    );

    if (similar) {
      // 평균 가격으로 병합
      similar.price = similar.price.plus(level.price).div(2);
      similar.touches += 1;
      similar.strength = Math.min(similar.strength + 0.1, 1.0);
    } else {
      merged.push({ ...level });
    }
  }

  return merged;
}

/**
 * 현재 가격이 지지/저항선 근처에 있는지 확인
 *
 * @param currentPrice - 현재 가격
 * @param levels - 지지/저항선 배열
 * @param threshold - 근접 판단 기준 (기본값: 1% = 0.01)
 * @returns 근처 레벨 또는 null
 */
export function findNearbyLevel(
  currentPrice: Big,
  levels: SupportResistanceLevel[],
  threshold = 0.01
): SupportResistanceLevel | null {
  for (const level of levels) {
    const distance = currentPrice.minus(level.price).abs().div(level.price);

    if (distance.lt(threshold)) {
      return level;
    }
  }

  return null;
}
