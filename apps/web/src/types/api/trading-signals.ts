export interface TradingSignalDTO {
  id: string;
  symbol: string;
  market: 'CRYPTO' | 'KR' | 'US';
  broker: 'KIS' | 'UPBIT';
  signal_type: 'BUY' | 'SELL' | 'HOLD';
  entry_price: string;
  target_price: string;
  stop_loss: string;
  confidence: number;
  reason: string | null;
  indicators: Record<string, unknown> | null;
  created_at: string;
  consumed_at: string | null;
  ai_analysis_id: string | null;
}

export interface TradingSignalsResponse {
  signals: TradingSignalDTO[];
  meta: {
    total: number;
    averageConfidence: number;
    generatedAtUtc: string;
  };
}
