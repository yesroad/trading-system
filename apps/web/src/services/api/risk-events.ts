import Services from '../client';
import type { RiskEventsResponse } from '@/types/api/risk-events';

class RiskEventsService extends Services {
  getEvents(params?: {
    severity?: 'low' | 'medium' | 'high' | 'critical';
    hours?: number;
  }): Promise<RiskEventsResponse> {
    return this.get<RiskEventsResponse>('/', params);
  }
}

const riskEventsService = new RiskEventsService({
  baseURL: '/api/risk-events',
});

export default riskEventsService;
