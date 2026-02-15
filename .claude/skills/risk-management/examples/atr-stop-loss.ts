/**
 * ATR-based Stop Loss Calculator
 *
 * 사용처: services/trade-executor/lib/atr-stop-loss.ts
 */

import Big from 'big.js';

// ============================================================================
// Types
// ============================================================================

interface Candle {
  high: Big;
  low: Big;
  close: Big;
  timestamp: string;
}

interface ATRStopLossParams {
  entry: Big;
  atr: Big;
  multiplier: number;
  side: 'long' | 'short';
  minStopPct?: number;
  maxStopPct?: number;
}

// ============================================================================
// ATR Calculation
// ============================================================================

/**
 * True Range 계산
 */
export function calculateTrueRange(candle: {
  high: Big;
  low: Big;
  prevClose: Big;
}): Big {
  const { high, low, prevClose } = candle;

  const range1 = high.minus(low);
  const range2 = high.minus(prevClose).abs();
  const range3 = low.minus(prevClose).abs();

  return Big.max(range1, range2, range3);
}

/**
 * ATR 계산 (Wilder's Smoothing)
 */
export function calculateATR(
  candles: Candle[],
  period: number = 14
): Big {
  if (candles.length < period + 1) {
    throw new Error(`Need at least ${period + 1} candles`);
  }

  const trValues: Big[] = [];

  // Calculate TR for each candle
  for (let i = 1; i < candles.length; i++) {
    const tr = calculateTrueRange({
      high: candles[i].high,
      low: candles[i].low,
      prevClose: candles[i - 1].close,
    });
    trValues.push(tr);
  }

  // First ATR is simple average
  const firstATR = trValues
    .slice(0, period)
    .reduce((sum, tr) => sum.plus(tr), new Big(0))
    .div(period);

  // Apply Wilder's Smoothing
  let atr = firstATR;
  for (let i = period; i < trValues.length; i++) {
    atr = atr.times(period - 1).plus(trValues[i]).div(period);
  }

  return atr;
}

// ============================================================================
// Stop Loss Calculation
// ============================================================================

/**
 * ATR 기반 손절가 계산
 */
export function calculateATRStopLoss(params: ATRStopLossParams): Big {
  const {
    entry,
    atr,
    multiplier,
    side,
    minStopPct = 0.005,  // 0.5%
    maxStopPct = 0.05,   // 5%
  } = params;

  // ATR 기반 손절 거리
  const stopDistance = atr.times(multiplier);

  // 손절가 계산
  let stopLoss: Big;
  if (side === 'long') {
    stopLoss = entry.minus(stopDistance);
  } else {
    stopLoss = entry.plus(stopDistance);
  }

  // 퍼센트 변환
  const stopPct = stopDistance.div(entry);

  // 최소/최대 범위 제한
  if (stopPct.lt(minStopPct)) {
    // 너무 타이트하면 최소값 사용
    stopLoss = side === 'long'
      ? entry.times(1 - minStopPct)
      : entry.times(1 + minStopPct);
  } else if (stopPct.gt(maxStopPct)) {
    // 너무 느슨하면 최대값 사용
    stopLoss = side === 'long'
      ? entry.times(1 - maxStopPct)
      : entry.times(1 + maxStopPct);
  }

  return stopLoss;
}

/**
 * Trailing Stop 업데이트 (Long만 지원)
 */
export function updateTrailingStop(params: {
  currentPrice: Big;
  currentStop: Big;
  atr: Big;
  multiplier: number;
}): Big {
  const newStop = params.currentPrice.minus(
    params.atr.times(params.multiplier)
  );

  // Long 포지션: 손절가는 올라가기만 함
  return Big.max(params.currentStop, newStop);
}

/**
 * 레버리지 조정 ATR Multiplier
 */
export function adjustATRMultiplierForLeverage(
  baseMultiplier: number,
  leverage: number
): number {
  // 레버리지가 높을수록 손절을 타이트하게
  return baseMultiplier / leverage;
}

// ============================================================================
// Market-Specific ATR Settings
// ============================================================================

interface ATRSettings {
  period: number;
  multiplier: number;
}

export function getATRSettings(market: 'KRW' | 'KRX' | 'US'): ATRSettings {
  switch (market) {
    case 'KRW':  // 암호화폐
      return { period: 14, multiplier: 2.5 };  // 변동성 큼
    case 'KRX':  // 한국 주식
      return { period: 14, multiplier: 2.0 };
    case 'US':   // 미국 주식
      return { period: 14, multiplier: 2.0 };
    default:
      return { period: 14, multiplier: 2.0 };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * ATR 기반 진입 검증
 */
export async function validateEntryWithATR(params: {
  symbol: string;
  market: 'KRW' | 'KRX' | 'US';
  entry: Big;
  atr: Big;
  accountSize: Big;
  maxRiskPct: number;
  leverage?: number;
}): Promise<{
  approved: boolean;
  stopLoss: Big;
  positionSize: Big;
  stopPct: number;
}> {
  const { symbol, market, entry, atr, accountSize, maxRiskPct, leverage = 1 } = params;

  // ATR 설정 조회
  const settings = getATRSettings(market);

  // 레버리지 조정
  const adjustedMultiplier = adjustATRMultiplierForLeverage(
    settings.multiplier,
    leverage
  );

  // 손절가 계산
  const stopLoss = calculateATRStopLoss({
    entry,
    atr,
    multiplier: adjustedMultiplier,
    side: 'long',
  });

  // 주당 리스크
  const riskPerShare = entry.minus(stopLoss);
  const stopPct = riskPerShare.div(entry).toNumber();

  // 포지션 크기 계산
  const riskAmount = accountSize.times(maxRiskPct);
  const positionSize = riskAmount.div(riskPerShare);

  // 승인 조건: 0.5% ~ 5%
  const approved = stopPct >= 0.005 && stopPct <= 0.05;

  return {
    approved,
    stopLoss,
    positionSize,
    stopPct,
  };
}

// ============================================================================
// Example Usage
// ============================================================================

async function exampleUsage() {
  // 예시 캔들 데이터 생성 (실전에서는 DB에서 조회)
  const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
    high: new Big(100 + Math.random() * 10),
    low: new Big(95 + Math.random() * 5),
    close: new Big(97 + Math.random() * 6),
    timestamp: new Date(Date.now() - i * 86400000).toISOString(),
  }));

  // ATR 계산
  const atr = calculateATR(candles, 14);
  console.log('ATR:', atr.toString());

  // 손절가 계산
  const entry = new Big(100);
  const stopLoss = calculateATRStopLoss({
    entry,
    atr,
    multiplier: 2.0,
    side: 'long',
  });

  console.log('Entry:', entry.toString());
  console.log('Stop Loss:', stopLoss.toString());
  console.log('Stop %:', entry.minus(stopLoss).div(entry).times(100).toFixed(2) + '%');

  // 진입 검증
  const validation = await validateEntryWithATR({
    symbol: 'BTC',
    market: 'KRW',
    entry,
    atr,
    accountSize: new Big(100000),
    maxRiskPct: 0.01,
    leverage: 1.5,
  });

  if (validation.approved) {
    console.log('\n✅ Entry approved');
    console.log('Position Size:', validation.positionSize.toString());
    console.log('Stop Loss:', validation.stopLoss.toString());
    console.log('Stop %:', (validation.stopPct * 100).toFixed(2) + '%');
  } else {
    console.log('\n❌ Entry rejected - Stop % out of range');
  }

  // Trailing Stop 예시
  const currentPrice = new Big(110);  // 가격 상승
  const currentStop = stopLoss;
  const newStop = updateTrailingStop({
    currentPrice,
    currentStop,
    atr,
    multiplier: 2.0,
  });

  console.log('\nTrailing Stop Update:');
  console.log('Current Price:', currentPrice.toString());
  console.log('Old Stop:', currentStop.toString());
  console.log('New Stop:', newStop.toString());
}

// Uncomment to run example
// exampleUsage();
