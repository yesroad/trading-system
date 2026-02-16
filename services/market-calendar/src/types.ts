import { z } from 'zod';

// ============================================================
// Economic Events (FMP API)
// ============================================================

export const EconomicEventSchema = z.object({
  date: z.string(), // ISO timestamp
  country: z.string(),
  event: z.string(),
  currency: z.string().optional(),
  previous: z.number().nullable().optional(),
  estimate: z.number().nullable().optional(),
  actual: z.number().nullable().optional(),
  impact: z.enum(['High', 'Medium', 'Low']).optional(),
});

export type EconomicEvent = z.infer<typeof EconomicEventSchema>;

export const EconomicEventsResponseSchema = z.array(EconomicEventSchema);

// ============================================================
// Earnings Calendar (FMP API)
// ============================================================

export const EarningsEventSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  symbol: z.string(),
  eps: z.number().nullable().optional(),
  epsEstimated: z.number().nullable().optional(),
  time: z.enum(['bmo', 'amc', 'tbc']).optional(), // before market open, after close, to be confirmed
  revenue: z.number().nullable().optional(),
  revenueEstimated: z.number().nullable().optional(),
});

export type EarningsEvent = z.infer<typeof EarningsEventSchema>;

export const EarningsEventsResponseSchema = z.array(EarningsEventSchema);

// ============================================================
// Unified Calendar Event (DB 저장용)
// ============================================================

export interface CalendarEvent {
  id?: string;
  type: 'economic' | 'earnings';
  title: string;
  summary: string | null;
  source: string;
  impactScore: number; // 1-10
  affectedSectors: string[] | null;
  priceImpactPct: number | null;
  publishedAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}

// ============================================================
// Impact Scoring
// ============================================================

export interface ImpactScoringResult {
  score: number; // 1-10
  reasoning: string;
  affectedSectors: string[];
}

// ============================================================
// Collector Results
// ============================================================

export interface CollectorResult {
  source: string;
  eventsCount: number;
  successCount: number;
  errorCount: number;
  errors: Array<{ event: string; error: string }>;
}
