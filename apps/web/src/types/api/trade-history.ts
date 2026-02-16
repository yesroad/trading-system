export interface TradeExecutionDTO {
  id: string;
  broker: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  status: string;
  quantity: number;
  price: number;
  executed_qty: number;
  executed_price: number;
  market: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface TradeHistoryResponse {
  trades: TradeExecutionDTO[];
  meta: {
    total: number;
    generatedAtUtc: string;
  };
}
