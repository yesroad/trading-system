import type Big from 'big.js';

// ============================================================
// 캔들 데이터
// ============================================================

export interface Candle {
  symbol: string;
  candleTime: string; // ISO timestamp
  open: Big;
  high: Big;
  low: Big;
  close: Big;
  volume: Big;
}

export interface CandleRaw {
  // upbit: market 컬럼, kis/yf: symbol 컬럼
  market?: string;
  symbol?: string;
  // 시간 컬럼
  candle_time_utc: string;
  // OHLCV
  open: unknown;
  high: unknown;
  low: unknown;
  close: unknown;
  volume: unknown;
}

// ============================================================
// 거래
// ============================================================

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface Trade {
  id?: string;
  symbol: string;
  side: OrderSide;
  qty: Big;
  price: Big;
  timestamp: string;
  commission: Big;
  slippage: Big;
  realizedPnL?: Big;
}

// ============================================================
// 포지션
// ============================================================

export interface Position {
  symbol: string;
  qty: Big;
  avgPrice: Big;
  unrealizedPnL: Big;
  entryTime: string;
}

// ============================================================
// 전략 인터페이스
// ============================================================

export interface StrategySignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  qty?: Big; // 수량 (선택적)
  reason?: string;
}

export interface Strategy {
  name: string;
  params: Record<string, unknown>;

  /**
   * 전략 시그널 생성
   * @param candles - 현재까지의 캔들 데이터
   * @param position - 현재 포지션 (없으면 null)
   * @returns 매수/매도/홀드 시그널
   */
  generateSignal(candles: Candle[], position: Position | null): StrategySignal;
}

// ============================================================
// Walk-Forward 설정
// ============================================================

export interface WalkForwardConfig {
  inSampleDays: number; // In-sample 기간 (예: 90일)
  outSampleDays: number; // Out-of-sample 기간 (예: 30일)
  stepDays: number; // 이동 간격 (예: 15일)
  minOosTrades?: number; // OOS 최소 거래 수 (미달 시 평가불가 처리, 기본: 3)
  warmupDays?: number; // 지표 워밍업 기간: IS/OOS 시작 전 추가 로드 (기본: 0)
}

export interface WalkForwardWindow {
  inSampleStart: string;
  inSampleEnd: string;
  outSampleStart: string;
  outSampleEnd: string;
}

// ============================================================
// 슬리피지 모델
// ============================================================

export type SlippageModel = 'fixed' | 'linear' | 'sqrt';

export interface SlippageParams {
  model: SlippageModel;
  orderSize: Big; // 주문 크기 (수량 × 가격)
  avgVolume: Big; // 평균 거래량
  bidAskSpread: Big; // 호가 스프레드 (%)
  fixedPct?: number; // Fixed 모델 슬리피지 (%)
  stressMultiplier?: number; // 스트레스 모드 배수 (기본: 1.0, 스트레스: 3~5)
}

// ============================================================
// 성과 지표
// ============================================================

export interface PerformanceMetrics {
  totalReturn: number; // 총 수익률 (%)
  sharpeRatio: number; // Sharpe 비율
  maxDrawdown: number; // 최대 낙폭 (%)
  winRate: number; // 승률 (%)
  profitFactor: number; // 수익 팩터 (총 수익 / 총 손실)
  avgWin: Big; // 평균 승리 금액
  avgLoss: Big; // 평균 손실 금액
  totalTrades: number; // 총 거래 횟수
  winningTrades: number; // 승리 거래 수
  losingTrades: number; // 손실 거래 수
  avgTradeDuration: number; // 평균 거래 지속 시간 (시간)
}

// ============================================================
// 백테스트 결과
// ============================================================

export interface BacktestResult {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: Big;
  finalCapital: Big;
  totalReturn: number;
  metrics: PerformanceMetrics;
  trades: Trade[];
  equity: EquityPoint[];
  drawdowns: DrawdownPoint[];
}

export interface EquityPoint {
  timestamp: string;
  equity: Big;
}

export interface DrawdownPoint {
  timestamp: string;
  drawdown: number; // %
  peak: Big;
}

// ============================================================
// Walk-Forward 결과
// ============================================================

export interface WalkForwardResult {
  strategy: string;
  symbol: string;
  config: WalkForwardConfig;
  windows: WalkForwardWindowResult[];
  aggregatedMetrics: PerformanceMetrics;
  inSampleMetrics: PerformanceMetrics;
  outSampleMetrics: PerformanceMetrics;
}

/** OOS 거래 수 기준 평가 상태 */
export type WalkForwardWindowStatus = 'valid' | 'insufficient_trades';

export interface WalkForwardWindowResult {
  window: WalkForwardWindow;
  inSampleResult: BacktestResult;
  outSampleResult: BacktestResult;
  status: WalkForwardWindowStatus; // valid: 충분한 거래, insufficient_trades: 평가불가
  oosTrades: number; // OOS 실제 거래 수 (BUY+SELL 쌍 기준)
}

// ============================================================
// 백테스트 설정
// ============================================================

export interface BacktestConfig {
  symbol: string;
  startDate: string;
  endDate: string;
  initialCapital: Big;
  commission: number; // 수수료 (%)
  slippage: SlippageParams;
  maxPositionSize?: Big; // 최대 포지션 크기 (자본 대비 %)
}
