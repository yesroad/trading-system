import Services from '../client';
import type { TradeHistoryResponse } from '@/types/api/trade-history';

class TradeHistoryService extends Services {
  getTrades(params?: {
    market?: 'CRYPTO' | 'KR' | 'US';
    broker?: 'KIS' | 'UPBIT';
  }): Promise<TradeHistoryResponse> {
    return this.get<TradeHistoryResponse>('/', params);
  }
}

const tradeHistoryService = new TradeHistoryService({
  baseURL: '/api/trade-history',
});

export default tradeHistoryService;
