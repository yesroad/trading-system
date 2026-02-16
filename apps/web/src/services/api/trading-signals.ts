import Services from '../client';
import type { TradingSignalsResponse } from '@/types/api/trading-signals';

class TradingSignalsService extends Services {
  getSignals(params?: {
    market?: 'CRYPTO' | 'KR' | 'US';
    minConfidence?: number;
  }): Promise<TradingSignalsResponse> {
    return this.get<TradingSignalsResponse>('/', params);
  }
}

const tradingSignalsService = new TradingSignalsService({
  baseURL: '/api/trading-signals',
});

export default tradingSignalsService;
