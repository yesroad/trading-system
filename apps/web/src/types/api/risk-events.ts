export interface RiskEventDTO {
  id: string;
  event_type: string;
  violation_type: string | null;
  symbol: string | null;
  violation_details: Record<string, unknown> | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  created_at: string;
}

export interface RiskEventsResponse {
  events: RiskEventDTO[];
  meta: {
    total: number;
    criticalCount: number;
    highCount: number;
    generatedAtUtc: string;
  };
}
