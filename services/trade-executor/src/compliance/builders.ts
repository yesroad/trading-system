import type Big from 'big.js';
import type {
  Aspiration,
  Capability,
  Execution,
  SignalInfo,
  MarketAnalysis,
  RiskAssessment,
} from './types.js';
import type { GeneratedSignal } from '../signals/types.js';
import type { RiskValidationResult } from '../risk/types.js';

/**
 * Aspiration 빌더
 *
 * 거래의 목표를 정의합니다.
 *
 * @param params - Aspiration 빌드 파라미터
 * @returns Aspiration 객체
 */
export function buildAspiration(params: {
  signal: GeneratedSignal;
  strategy?: string;
}): Aspiration {
  const { signal, strategy } = params;

  // 목표 수익률 계산
  const entry = parseFloat(signal.entry_price);
  const target = parseFloat(signal.target_price);
  const targetProfitPct = ((target - entry) / entry) * 100;

  // 최대 손실 계산
  const stopLoss = parseFloat(signal.stop_loss);
  const maxLossPct = Math.abs(((stopLoss - entry) / entry) * 100);

  return {
    strategy: strategy || `${signal.signal_type} 신호 기반 거래`,
    targetProfit: `${targetProfitPct.toFixed(2)}%`,
    maxLoss: `${maxLossPct.toFixed(2)}%`,
    timeHorizon: '1-3일', // 기본값
    additionalGoals: {
      riskRewardRatio: (targetProfitPct / maxLossPct).toFixed(2),
    },
  };
}

/**
 * Capability 빌더
 *
 * 거래를 실행할 수 있는 역량을 평가합니다.
 *
 * @param params - Capability 빌드 파라미터
 * @returns Capability 객체
 */
export function buildCapability(params: {
  signal: GeneratedSignal;
  riskValidation: RiskValidationResult;
  marketAnalysis?: MarketAnalysis;
}): Capability {
  const { signal, riskValidation, marketAnalysis } = params;

  // 신호 정보 구성
  const signals: SignalInfo[] = [
    {
      type: 'combined', // AI + 기술적
      confidence: signal.confidence,
      indicators: signal.indicators || {},
    },
  ];

  // 리스크 평가 정보 구성
  const riskAssessment: RiskAssessment = {
    positionSize: riskValidation.positionSize.toString(),
    positionValue: riskValidation.positionValue.toString(),
    violations: riskValidation.violations,
    warnings: riskValidation.warnings,
  };

  // 레버리지 정보 추가
  if (riskValidation.leverageValidation) {
    riskAssessment.leverage = riskValidation.leverageValidation.requestedLeverage.toFixed(2);
  }

  // 노출도 정보 추가
  if (riskValidation.exposureValidation) {
    riskAssessment.exposure = riskValidation.exposureValidation.newExposure.times(100).toFixed(2) + '%';
  }

  return {
    signals,
    marketAnalysis,
    riskAssessment,
    dataQuality: {
      indicatorsAvailable: Object.keys(signal.indicators || {}).length,
      dataFreshness: 'recent', // TODO: 실제 데이터 신선도 계산
    },
  };
}

/**
 * Execution 빌더
 *
 * 실제 거래 실행 내역을 기록합니다.
 *
 * @param params - Execution 빌드 파라미터
 * @returns Execution 객체
 */
export function buildExecution(params: {
  signal: GeneratedSignal;
  positionSize: Big;
  tradeId?: string;
  orderId?: string;
  reason?: string;
}): Execution {
  const { signal, positionSize, tradeId, orderId, reason } = params;

  return {
    decision: signal.signal_type as 'BUY' | 'SELL' | 'SKIP',
    actualEntry: parseFloat(signal.entry_price),
    actualStopLoss: parseFloat(signal.stop_loss),
    actualTarget: parseFloat(signal.target_price),
    size: parseFloat(positionSize.toString()),
    tradeId,
    orderId,
    timestamp: new Date().toISOString(),
    reason: reason || signal.reason || '리스크 검증 통과',
  };
}

/**
 * Outcome 빌더
 *
 * 거래 종료 후 결과를 기록합니다.
 *
 * @param params - Outcome 빌드 파라미터
 * @returns Outcome 객체
 */
export function buildOutcome(params: {
  entryPrice: number;
  exitPrice: number;
  size: number;
  side: 'BUY' | 'SELL';
  entryTime: string;
  exitTime: string;
  exitReason?: string;
}): {
  exitPrice: number;
  realizedPnL: number;
  pnLPct: number;
  duration: string;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  exitReason?: string;
} {
  const { entryPrice, exitPrice, size, side, entryTime, exitTime, exitReason } = params;

  // 실현 손익 계산
  let realizedPnL: number;
  if (side === 'BUY') {
    realizedPnL = (exitPrice - entryPrice) * size;
  } else {
    realizedPnL = (entryPrice - exitPrice) * size;
  }

  // 손익 퍼센트
  const pnLPct = (realizedPnL / (entryPrice * size)) * 100;

  // 결과 판정
  let result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  if (pnLPct > 0.1) {
    result = 'WIN';
  } else if (pnLPct < -0.1) {
    result = 'LOSS';
  } else {
    result = 'BREAKEVEN';
  }

  // 보유 기간 계산
  const entryDate = new Date(entryTime);
  const exitDate = new Date(exitTime);
  const durationMs = exitDate.getTime() - entryDate.getTime();
  const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
  const duration = durationHours < 24 ? `${durationHours}시간` : `${Math.floor(durationHours / 24)}일`;

  return {
    exitPrice,
    realizedPnL,
    pnLPct,
    duration,
    result,
    exitReason,
  };
}
