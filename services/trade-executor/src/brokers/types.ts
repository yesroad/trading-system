import type { Broker, Market } from '../config/markets.js';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';

export interface OrderRequest {
  market: Market;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  price?: string | null;
  reason?: string;
  dryRun?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OrderResult {
  broker: Broker;
  market: Market;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  requestedQty: string;
  requestedPrice: string | null;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  dryRun: boolean;
  orderId?: string;
  executedQty?: string;
  executedPrice?: string;
  feeAmount?: string;
  taxAmount?: string;
  costSource?: 'BROKER' | 'UNAVAILABLE';
  message: string;
  raw?: unknown;
}

export interface BrokerClient {
  readonly broker: Broker;
  getCurrentPrice(params: { market: Market; symbol: string }): Promise<number | null>;
  placeOrder(request: OrderRequest): Promise<OrderResult>;
}
