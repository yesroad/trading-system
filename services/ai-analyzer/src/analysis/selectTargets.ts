// analysis/selectTargets.ts
import { Market } from '../config/markets';
import type { Snapshot } from './collectSnapshot';

export type SelectedTarget = {
  symbol: string;
  score: number;
  reason: string;
};

export async function selectTargets(
  market: Market,
  maxTargets: number,
  snapshot: Snapshot,
): Promise<SelectedTarget[]> {
  const symbols = snapshot.ingestion.recentRuns.flatMap((r) => r.symbols ?? []).filter(Boolean);

  const uniq = Array.from(new Set(symbols)).slice(0, maxTargets);

  return uniq.map((symbol, idx) => ({
    symbol,
    score: maxTargets - idx,
    reason: '최근 수집 대상',
  }));
}
