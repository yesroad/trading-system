// analysis/selectTargets.ts
import type { Snapshot } from './collectSnapshot';

export type SelectedTarget = {
  symbol: string;
  score: number;
  reason: string;
};

export async function selectTargets(maxTargets: number, snapshot: Snapshot): Promise<SelectedTarget[]> {
  // 성공한 수집 runs만 필터링
  const successfulRuns = snapshot.ingestion.recentRuns.filter((r) => r.status === 'success');

  // 성공한 runs에서 symbols 추출
  const symbols = successfulRuns.flatMap((r) => r.symbols ?? []).filter(Boolean);

  // 중복 제거 + maxTargets 제한
  const uniq = Array.from(new Set(symbols)).slice(0, maxTargets);

  return uniq.map((symbol, idx) => ({
    symbol,
    score: maxTargets - idx,
    reason: '최근 수집 성공',
  }));
}
