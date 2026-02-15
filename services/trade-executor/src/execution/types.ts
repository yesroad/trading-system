import type Big from 'big.js';
import type { Broker, Market } from '../config/markets.js';

/**
 * 주문 타입
 */
export type OrderType = 'market' | 'limit';

/**
 * 주문 방향
 */
export type OrderSide = 'BUY' | 'SELL';

/**
 * 주문 실행 파라미터
 */
export interface ExecuteOrderParams {
  /** 심볼 */
  symbol: string;
  /** 브로커 */
  broker: Broker;
  /** 시장 */
  market: Market;
  /** 주문 방향 */
  side: OrderSide;
  /** 수량 */
  qty: Big;
  /** 가격 (지정가 주문 시) */
  price?: Big;
  /** 주문 타입 */
  orderType?: OrderType;
  /** Dry-run 모드 */
  dryRun?: boolean;
  /** ACE 로그 ID (추적용) */
  aceLogId?: string;
}

/**
 * 주문 실행 결과
 */
export interface OrderExecutionResult {
  /** 성공 여부 */
  success: boolean;
  /** 거래 ID (trades 테이블) */
  tradeId?: string;
  /** 브로커 주문 ID */
  orderId?: string;
  /** 체결 가격 */
  executedPrice?: string;
  /** 체결 수량 */
  executedQty?: string;
  /** 에러 메시지 */
  error?: string;
  /** Dry-run 여부 */
  dryRun: boolean;
}

/**
 * KIS 주문 응답
 */
export interface KisOrderResponse {
  rt_cd: string; // 응답 코드 (0: 성공)
  msg_cd: string;
  msg1: string;
  output?: {
    KRX_FWDG_ORD_ORGNO?: string; // 주문 번호
    ODNO?: string; // 주문번호
    ORD_TMD?: string; // 주문시간
  };
}

/**
 * Upbit 주문 응답
 */
export interface UpbitOrderResponse {
  uuid: string; // 주문 ID
  side: 'bid' | 'ask';
  ord_type: 'limit' | 'price' | 'market';
  price?: string;
  avg_price?: string;
  state: 'wait' | 'watch' | 'done' | 'cancel';
  market: string;
  created_at: string;
  volume?: string;
  remaining_volume?: string;
  reserved_fee: string;
  remaining_fee: string;
  paid_fee: string;
  locked: string;
  executed_volume: string;
  trades_count: number;
}
