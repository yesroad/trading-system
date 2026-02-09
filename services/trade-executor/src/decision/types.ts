import type { AiDecision } from '../db/queries.js';
import type { Broker, Market } from '../config/markets.js';

export type TradeAction = 'BUY' | 'SELL' | 'SKIP';

export interface Position {
  broker: string;
  market: string;
  symbol: string;
  qty: number;
  avgPrice: number | null;
  updatedAt: string;
}

export interface Candidate {
  market: Market;
  broker: Broker;
  symbol: string;
  aiAnalysisId: number | string;
  aiDecision: AiDecision;
  confidence: number;
  summary: string;
  hasPosition: boolean;
  positionQty: string;
  avgPrice: string | null;
  action: TradeAction;
  reason: string;
  createdAt: string;
}

export interface Decision {
  action: TradeAction;
  market: Market;
  broker: Broker;
  symbol: string;
  confidence: number;
  aiDecision: AiDecision;
  aiAnalysisId: number | string;
  reason: string;
  dryRun: boolean;
}
