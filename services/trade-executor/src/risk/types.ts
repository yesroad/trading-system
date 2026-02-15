import type Big from 'big.js';

/**
 * 시장 타입
 */
export type Market = 'CRYPTO' | 'KRX' | 'US';

/**
 * 브로커 타입
 */
export type Broker = 'UPBIT' | 'KIS';

/**
 * 포지션 사이징 파라미터
 */
export interface PositionSizingParams {
  /** 계좌 크기 */
  accountSize: Big;
  /** 리스크 퍼센트 (기본 1% = 0.01) */
  riskPercentage: number;
  /** 진입가 */
  entry: Big;
  /** 손절가 */
  stopLoss: Big;
  /** 심볼 */
  symbol: string;
}

/**
 * 포지션 사이징 결과
 */
export interface PositionSizingResult {
  /** 포지션 크기 (수량) */
  positionSize: Big;
  /** 포지션 가치 (금액) */
  positionValue: Big;
  /** 리스크 금액 */
  riskAmount: Big;
  /** 최대 포지션 가치 (계좌의 25%) */
  maxPositionValue: Big;
  /** 최대 노출도 제한으로 인한 조정 여부 */
  limitedByMaxExposure: boolean;
}

/**
 * 서킷 브레이커 상태
 */
export interface CircuitBreakerState {
  /** 서킷 브레이커 발동 여부 */
  triggered: boolean;
  /** 발동 이유 */
  reason: string;
  /** 일일 P&L */
  dailyPnL?: Big;
  /** 일일 P&L 퍼센트 */
  dailyPnLPct?: Big;
  /** 쿨다운 종료 시각 */
  cooldownUntil?: string;
}

/**
 * 레버리지 검증 결과
 */
export interface LeverageValidationResult {
  /** 검증 통과 여부 */
  valid: boolean;
  /** 요청된 레버리지 */
  requestedLeverage: Big;
  /** 최대 허용 레버리지 */
  maxLeverage: Big;
  /** 위반 사항 */
  violations: string[];
}

/**
 * 노출도 검증 결과
 */
export interface ExposureValidationResult {
  /** 검증 통과 여부 */
  valid: boolean;
  /** 현재 노출도 (계좌 대비 퍼센트) */
  currentExposure: Big;
  /** 새 포지션 추가 후 노출도 */
  newExposure: Big;
  /** 최대 허용 노출도 (100%) */
  maxExposure: Big;
  /** 위반 사항 */
  violations: string[];
}

/**
 * 종합 리스크 검증 파라미터
 */
export interface RiskValidationParams {
  /** 심볼 */
  symbol: string;
  /** 시장 */
  market: Market;
  /** 브로커 */
  broker: Broker;
  /** 진입가 */
  entry: Big;
  /** 손절가 */
  stopLoss: Big;
  /** 신호 신뢰도 */
  signalConfidence: number;
}

/**
 * 종합 리스크 검증 결과
 */
export interface RiskValidationResult {
  /** 승인 여부 */
  approved: boolean;
  /** 포지션 크기 (승인된 경우) */
  positionSize: Big;
  /** 포지션 가치 (승인된 경우) */
  positionValue: Big;
  /** 위반 사항 목록 */
  violations: string[];
  /** 경고 사항 목록 */
  warnings: string[];
  /** 서킷 브레이커 상태 */
  circuitBreakerState?: CircuitBreakerState;
  /** 레버리지 검증 결과 */
  leverageValidation?: LeverageValidationResult;
  /** 노출도 검증 결과 */
  exposureValidation?: ExposureValidationResult;
}

/**
 * 일일 P&L 계산 결과
 */
export interface DailyPnLResult {
  /** 실현 손익 */
  realizedPnL: Big;
  /** 미실현 손익 */
  unrealizedPnL: Big;
  /** 총 손익 */
  totalPnL: Big;
  /** 총 손익 퍼센트 (계좌 대비) */
  totalPnLPct: Big;
  /** 계산 시각 */
  calculatedAt: string;
}

/**
 * 포지션 정보
 */
export interface Position {
  /** 심볼 */
  symbol: string;
  /** 브로커 */
  broker: Broker;
  /** 시장 */
  market: Market;
  /** 수량 */
  qty: Big;
  /** 평균 단가 */
  avgPrice: Big;
  /** 현재가 */
  currentPrice?: Big;
}
