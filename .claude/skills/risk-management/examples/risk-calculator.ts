/**
 * Risk Calculator - 포지션 사이징 및 리스크 검증
 *
 * 사용처: services/trade-executor/lib/risk.ts
 */

import Big from 'big.js';

// ============================================================================
// Types
// ============================================================================

interface Position {
  id: string;
  symbol: string;
  broker: 'KIS' | 'UPBIT';
  market: 'KRW' | 'KRX' | 'US';
  qty: Big;
  current_price: Big;
  leverage?: number;
}

interface PositionSizeParams {
  accountSize: Big;
  riskPercentage: number;  // 0.01 = 1%
  entry: Big;
  stopLoss: Big;
}

interface LeverageLimits {
  [key: string]: number;
}

// ============================================================================
// Constants
// ============================================================================

const CRYPTO_LEVERAGE_LIMITS: LeverageLimits = {
  'BTC': 1.5,
  'ETH': 1.5,
  'SOL': 1.2,
  'XRP': 1.2,
  'default': 1.0,
};

const MAX_POSITION_PCT = 0.25;  // 25% per symbol
const MAX_TOTAL_EXPOSURE = 1.0;  // 100% total

// ============================================================================
// Core Functions
// ============================================================================

/**
 * 포지션 크기 계산 (리스크 기반)
 */
export function calculatePositionSize(params: PositionSizeParams): Big {
  const { accountSize, riskPercentage, entry, stopLoss } = params;

  // 거래당 리스크 금액
  const riskAmount = accountSize.times(riskPercentage);

  // 주당 리스크
  const riskPerShare = entry.minus(stopLoss).abs();

  if (riskPerShare.eq(0)) {
    throw new Error('Stop loss cannot equal entry price');
  }

  // 포지션 크기 = 리스크 금액 / 주당 리스크
  return riskAmount.div(riskPerShare);
}

/**
 * 심볼당 최대 비중 적용
 */
export function limitPositionSize(
  calculatedSize: Big,
  entry: Big,
  accountSize: Big
): Big {
  const maxDollarAmount = accountSize.times(MAX_POSITION_PCT);
  const maxShares = maxDollarAmount.div(entry);

  return Big.min(calculatedSize, maxShares);
}

/**
 * 레버리지 한도 조회
 */
export function getMaxLeverage(symbol: string): number {
  return CRYPTO_LEVERAGE_LIMITS[symbol] || CRYPTO_LEVERAGE_LIMITS.default;
}

/**
 * 레버리지 적용 포지션 크기
 */
export function calculateLeveragedPosition(
  baseSize: Big,
  symbol: string
): Big {
  const maxLeverage = getMaxLeverage(symbol);
  return baseSize.times(maxLeverage);
}

/**
 * 총 포지션 노출 확인
 */
export function checkTotalExposure(
  positions: Position[],
  newPosition: { symbol: string; value: Big; leverage?: number },
  accountSize: Big
): boolean {
  // 현재 총 노출 (레버리지 포함)
  const currentExposure = positions.reduce((sum, pos) => {
    const posValue = pos.qty.times(pos.current_price).times(pos.leverage || 1);
    return sum.plus(posValue);
  }, new Big(0));

  // 신규 포지션 노출
  const newExposure = newPosition.value.times(newPosition.leverage || 1);

  // 총 레버리지 계산
  const totalExposure = currentExposure.plus(newExposure);
  const exposureRatio = totalExposure.div(accountSize);

  return exposureRatio.lte(MAX_TOTAL_EXPOSURE);
}

/**
 * Kelly Criterion 포지션 크기
 */
export function kellyPercentage(params: {
  winRate: number;
  avgWin: number;
  avgLoss: number;
}): number {
  const { winRate, avgWin, avgLoss } = params;
  const lossRate = 1 - winRate;

  const kelly = (winRate * avgWin - lossRate * avgLoss) / avgLoss;

  // Half Kelly (보수적)
  return kelly * 0.5;
}

// ============================================================================
// Validation
// ============================================================================

interface ValidationResult {
  approved: boolean;
  positionSize: Big;
  stopLoss: Big;
  violations: string[];
}

/**
 * 포지션 검증 (종합)
 */
export async function validateNewPosition(params: {
  symbol: string;
  broker: 'KIS' | 'UPBIT';
  market: 'KRW' | 'KRX' | 'US';
  entry: Big;
  stopLoss: Big;
  accountSize: Big;
  currentPositions: Position[];
  riskPercentage?: number;
}): Promise<ValidationResult> {
  const violations: string[] = [];
  const riskPct = params.riskPercentage || 0.01;  // 기본 1%

  // 1. 포지션 크기 계산
  let size = calculatePositionSize({
    accountSize: params.accountSize,
    riskPercentage: riskPct,
    entry: params.entry,
    stopLoss: params.stopLoss,
  });

  // 2. 심볼 한도 적용
  size = limitPositionSize(size, params.entry, params.accountSize);

  // 3. 손절 % 확인
  const stopPct = params.entry.minus(params.stopLoss).abs().div(params.entry);
  if (stopPct.lt(0.005)) {
    violations.push('Stop loss too tight (< 0.5%)');
  } else if (stopPct.gt(0.05)) {
    violations.push('Stop loss too wide (> 5%)');
  }

  // 4. 총 노출 확인
  const positionValue = size.times(params.entry);
  const leverage = getMaxLeverage(params.symbol);

  const totalExposureOk = checkTotalExposure(
    params.currentPositions,
    { symbol: params.symbol, value: positionValue, leverage },
    params.accountSize
  );

  if (!totalExposureOk) {
    violations.push(`Total exposure limit exceeded (max ${MAX_TOTAL_EXPOSURE}x)`);
  }

  // 5. R/R 비율 확인 (최소 1.5)
  // (target는 외부에서 계산하여 전달해야 함)

  return {
    approved: violations.length === 0,
    positionSize: size,
    stopLoss: params.stopLoss,
    violations,
  };
}

// ============================================================================
// Example Usage
// ============================================================================

async function exampleUsage() {
  const accountSize = new Big(100000);  // $100,000
  const entry = new Big(50);
  const stopLoss = new Big(48);
  const currentPositions: Position[] = [];

  // 포지션 검증
  const result = await validateNewPosition({
    symbol: 'BTC',
    broker: 'UPBIT',
    market: 'KRW',
    entry,
    stopLoss,
    accountSize,
    currentPositions,
    riskPercentage: 0.01,
  });

  if (result.approved) {
    console.log('✅ Position approved');
    console.log('Size:', result.positionSize.toString(), 'shares');
    console.log('Value:', result.positionSize.times(entry).toString());
  } else {
    console.log('❌ Position rejected');
    console.log('Violations:', result.violations);
  }
}

// Uncomment to run example
// exampleUsage();
