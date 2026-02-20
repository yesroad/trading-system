/**
 * ACE Framework - Aspiration-Capability-Execution-Outcome
 *
 * 거래의 전체 생명주기를 추적하여 완전한 감사 추적을 제공합니다.
 */

/**
 * 시장 타입
 */
export type Market = 'CRYPTO' | 'KRX' | 'US';

/**
 * 브로커 타입
 */
export type Broker = 'UPBIT' | 'KIS';

/**
 * A - Aspiration (목표)
 *
 * 거래의 목적과 목표를 정의합니다.
 */
export interface Aspiration {
  /** 전략 설명 */
  strategy: string;
  /** 목표 수익률 (예: "5%") */
  targetProfit: string;
  /** 최대 허용 손실 (예: "2%") */
  maxLoss: string;
  /** 예상 보유 기간 (예: "1-3 days") */
  timeHorizon: string;
  /** 추가 목표 */
  additionalGoals?: Record<string, unknown>;
}

/**
 * 신호 정보
 */
export interface SignalInfo {
  /** 신호 타입 (예: 'technical', 'ai', 'combined') */
  type: string;
  /** 신뢰도 (0~1) */
  confidence: number;
  /** 신호 세부 정보 */
  indicators?: Record<string, unknown>;
}

/**
 * 시장 분석 정보
 */
export interface MarketAnalysis {
  /** Market breadth 지수 */
  breadth?: number;
  /** 상승 추세 비율 */
  uptrendRatio?: number;
  /** 뉴스 영향 점수 */
  newsImpact?: number;
  /** 추가 분석 */
  additionalMetrics?: Record<string, unknown>;
}

/**
 * 리스크 평가 정보
 */
export interface RiskAssessment {
  /** 포지션 크기 */
  positionSize: string;
  /** 포지션 가치 */
  positionValue: string;
  /** 위반 사항 */
  violations: string[];
  /** 경고 사항 */
  warnings: string[];
  /** 레버리지 */
  leverage?: string;
  /** 노출도 */
  exposure?: string;
}

/**
 * C - Capability (역량)
 *
 * 거래를 실행할 수 있는 역량과 준비 상태를 평가합니다.
 */
export interface Capability {
  /** 신호들 */
  signals: SignalInfo[];
  /** 시장 분석 */
  marketAnalysis?: MarketAnalysis;
  /** 리스크 평가 */
  riskAssessment: RiskAssessment;
  /** 데이터 품질 평가 */
  dataQuality?: Record<string, unknown>;
}

/**
 * E - Execution (실행)
 *
 * 실제 거래 실행 내역을 기록합니다.
 */
export interface Execution {
  /** 결정 (BUY | SELL | SKIP) */
  decision: 'BUY' | 'SELL' | 'SKIP';
  /** 실제 진입가 */
  actualEntry: number;
  /** 실제 손절가 */
  actualStopLoss?: number;
  /** 실제 목표가 */
  actualTarget?: number;
  /** 실제 포지션 크기 */
  size: number;
  /** 거래 ID */
  tradeId?: string;
  /** 주문 ID */
  orderId?: string;
  /** 실행 타임스탬프 */
  timestamp: string;
  /** 실행 이유 */
  reason: string;
  /** 추가 실행 세부정보 */
  additionalDetails?: Record<string, unknown>;
}

/**
 * O - Outcome (결과)
 *
 * 거래 종료 후 결과를 기록합니다.
 */
export interface Outcome {
  /** 청산가 */
  exitPrice: number;
  /** 실현 손익 (금액) */
  realizedPnL: number;
  /** 비용 차감 전 총 손익 */
  grossPnL: number;
  /** 총 수수료 */
  totalFees: number;
  /** 총 세금 */
  totalTaxes: number;
  /** 실현 손익 (퍼센트) */
  pnLPct: number;
  /** 보유 기간 */
  duration: string;
  /** 결과 (WIN | LOSS | BREAKEVEN) */
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  /** 청산 이유 (예: 'target', 'stop_loss', 'manual') */
  exitReason?: string;
  /** 거래 품질 점수 (0~1) */
  qualityScore?: number;
  /** 추가 결과 메트릭 */
  additionalMetrics?: Record<string, unknown>;
}

/**
 * 완전한 ACE 로그
 */
export interface ACELog {
  /** ACE 로그 ID */
  id?: string;
  /** 심볼 */
  symbol: string;
  /** 시장 */
  market: Market;
  /** 브로커 */
  broker: Broker;
  /** A - Aspiration */
  aspiration: Aspiration;
  /** C - Capability */
  capability: Capability;
  /** E - Execution */
  execution: Execution;
  /** O - Outcome (거래 종료 후 업데이트) */
  outcome?: Outcome;
  /** 거래 ID */
  tradeId?: string;
  /** 생성 시각 */
  createdAt?: string;
  /** 업데이트 시각 */
  updatedAt?: string;
}

/**
 * ACE 로그 생성 파라미터
 */
export interface CreateACELogParams {
  /** 심볼 */
  symbol: string;
  /** 시장 */
  market: Market;
  /** 브로커 */
  broker: Broker;
  /** Aspiration */
  aspiration: Aspiration;
  /** Capability */
  capability: Capability;
  /** Execution */
  execution: Execution;
  /** 거래 ID (선택) */
  tradeId?: string;
}

/**
 * Outcome 업데이트 파라미터
 */
export interface UpdateOutcomeParams {
  /** ACE 로그 ID */
  aceLogId: string;
  /** Outcome */
  outcome: Outcome;
}
