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
 * 신호 타입
 */
export type SignalType = 'BUY' | 'SELL' | 'HOLD';

/**
 * AI 분석 결과 (기존 시스템)
 */
export interface AIAnalysisResult {
  id: string;
  symbol: string;
  market: Market;
  decision: 'BUY' | 'SELL' | 'SKIP';
  confidence: number;
  reasoning: string;
  price_at_analysis: string;
  analyzed_at: string;
}

/**
 * 기술적 지표 스냅샷
 */
export interface TechnicalSnapshot {
  /** 단순 이동평균 (20일) */
  sma20: Big | null;
  /** 지수 이동평균 (20일) */
  ema20: Big | null;
  /** MACD 결과 */
  macd: {
    macd: Big;
    signal: Big;
    histogram: Big;
  } | null;
  /** RSI 결과 */
  rsi: {
    value: Big;
    overbought: boolean;
    oversold: boolean;
  } | null;
  /** 거래량 분석 */
  volume: {
    avgVolume: Big;
    currentVolume: Big;
    volumeRatio: Big;
    isHighVolume: boolean;
  } | null;
  /** 지지/저항 레벨 */
  supportResistance: Array<{
    price: Big;
    type: 'support' | 'resistance';
    strength: number;
    touches: number;
  }>;
  /** ATR (변동성) */
  atr: Big | null;
  /** 현재가 */
  currentPrice: Big;
  /** 계산 시각 */
  calculatedAt: string;
}

/**
 * 신호 가격 정보
 */
export interface SignalPrices {
  /** 진입가 */
  entry: Big;
  /** 목표가 */
  target: Big;
  /** 손절가 */
  stopLoss: Big;
}

/**
 * 신호 검증 결과
 */
export interface SignalValidation {
  /** 검증 통과 여부 */
  valid: boolean;
  /** 위반 사항 목록 */
  violations: string[];
  /** R/R 비율 */
  riskRewardRatio: Big | null;
  /** 손절 퍼센트 */
  stopLossPct: Big | null;
}

/**
 * 생성된 거래 신호
 */
export interface GeneratedSignal {
  /** 신호 ID */
  id: string;
  /** 심볼 */
  symbol: string;
  /** 시장 */
  market: Market;
  /** 브로커 */
  broker: Broker;
  /** 신호 타입 */
  signal_type: SignalType;
  /** 진입가 */
  entry_price: string;
  /** 목표가 */
  target_price: string;
  /** 손절가 */
  stop_loss: string;
  /** 최종 신뢰도 */
  confidence: number;
  /** 신호 생성 근거 */
  reason: string;
  /** 기술적 지표 스냅샷 */
  indicators: Record<string, unknown>;
  /** AI 분석 ID */
  ai_analysis_id: string;
  /** 생성 시각 */
  created_at: string;
}

/**
 * 신호 생성 파라미터
 */
export interface SignalGenerationParams {
  /** AI 분석 ID */
  aiAnalysisId: string;
  /** 심볼 */
  symbol: string;
  /** 시장 */
  market: Market;
  /** 브로커 */
  broker: Broker;
  /** AI 결정 */
  aiDecision: 'BUY' | 'SELL' | 'SKIP';
  /** AI 신뢰도 */
  aiConfidence: number;
  /** 분석 시점 가격 */
  priceAtAnalysis: string;
  /** AI 분석 근거 */
  aiReasoning?: string;
}

/**
 * 신뢰도 블렌딩 결과
 */
export interface ConfidenceBlendResult {
  /** AI 신뢰도 */
  aiConfidence: number;
  /** 기술적 신뢰도 */
  technicalConfidence: number;
  /** 최종 블렌딩 신뢰도 (60% AI + 40% 기술적) */
  finalConfidence: number;
  /** 신뢰도 세부 내역 */
  breakdown: {
    aiWeight: number;
    technicalWeight: number;
    adjustments: Record<string, number>;
  };
}
