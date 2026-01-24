import type { Market } from '../config/markets';
import type { MarketMode } from '../config/schedule';
import type { Snapshot } from './collectSnapshot';

type TargetLike = { symbol: string } | string;

type LastAiInfo = {
  createdAt: Date | null;
  symbols: string[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v : null;
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
}

function normalizeSymbols(targets: TargetLike[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    const s = typeof t === 'string' ? t : t?.symbol;
    if (typeof s === 'string' && s.trim().length > 0) out.push(s.trim());
  }
  // unique
  return Array.from(new Set(out));
}

/** 시장별로 어떤 ingestion job이 "의미있는 변화"인지 정의 */
function getMarketJobs(market: Market): string[] {
  if (market === 'KR') return ['kis-equity'];
  if (market === 'US') return ['yfinance-equity'];
  return ['upbit-candle'];
}

/**
 * "새 수집 실행"이라도,
 * - 성공했고
 * - 실제로 데이터가 들어갔거나(inserted_count>0)
 * - 혹은 이번 타겟에 해당하는 심볼이 포함된 경우만
 * AI 실행 트리거로 인정한다.
 */
function isMeaningfulNewRun(params: {
  market: Market;
  lastAiAt: Date;
  targets: string[];
  run: unknown;
}): { ok: boolean; reason: string } {
  const { market, lastAiAt, targets, run } = params;

  if (!isRecord(run)) return { ok: false, reason: 'run이 객체가 아님' };

  // run 시간은 created_at을 쓰지 않고 started_at/finished_at을 우선 사용
  const startedAt = toDate(run.started_at);
  const finishedAt = toDate(run.finished_at);
  const runAt = finishedAt ?? startedAt;

  if (!runAt) return { ok: false, reason: 'started_at/finished_at 없음' };
  if (runAt <= lastAiAt) return { ok: false, reason: 'AI 이후 실행 아님' };

  // job 식별 (run.job 컬럼 기준)
  const job = typeof run.job === 'string' ? run.job : '';
  const allowedJobs = getMarketJobs(market);
  if (!allowedJobs.includes(job)) {
    return { ok: false, reason: `해당 market job 아님(job=${job || 'unknown'})` };
  }

  // status / error
  const status = typeof run.status === 'string' ? run.status : '';
  const errorMessage = typeof run.error_message === 'string' ? run.error_message : '';

  // 실패/에러는 의미있음(바로 AI로 원인 파악)
  if (status && status !== 'success') {
    return { ok: true, reason: `수집 실패/비정상(status=${status})` };
  }
  if (errorMessage.trim().length > 0) {
    return { ok: true, reason: '수집 에러 메시지 존재' };
  }

  // inserted_count 기준 (없으면 0 취급)
  const inserted =
    typeof run.inserted_count === 'number'
      ? run.inserted_count
      : typeof run.inserted_count === 'string'
        ? Number(run.inserted_count)
        : 0;

  // 심볼 포함 여부 (run.symbols가 배열이라고 가정, 아니면 스킵)
  const runSymbols =
    Array.isArray(run.symbols) && run.symbols.every((x) => typeof x === 'string')
      ? (run.symbols as string[])
      : [];

  const targetSet = new Set(targets);
  const hasTargetOverlap = runSymbols.some((s) => targetSet.has(s));

  // ✅ 핵심: "새 run"이어도 아래 중 하나일 때만 의미있다고 판단
  // 1) 타겟과 겹치는 종목을 실제로 수집했다
  // 2) inserted_count가 0보다 크다(실제로 뭔가 저장됐다)
  if (hasTargetOverlap) return { ok: true, reason: '타겟 심볼 수집 갱신' };
  if (Number.isFinite(inserted) && inserted > 0)
    return { ok: true, reason: '신규 데이터 저장(inserted_count>0)' };

  return { ok: false, reason: '성공이지만 변화 근거 부족(타겟겹침X, inserted_count=0)' };
}

function extractLastAiInfo(snapshot: Snapshot): LastAiInfo {
  const s = snapshot as unknown;
  if (!isRecord(s)) return { createdAt: null, symbols: [] };

  const ai = s.ai;
  if (!isRecord(ai)) return { createdAt: null, symbols: [] };

  // 1) 선호 형태
  const latestCreatedAt = toDate(ai.latestCreatedAt);
  const latestSymbols = Array.isArray(ai.latestSymbols)
    ? ai.latestSymbols.filter((x): x is string => typeof x === 'string' && x.length > 0)
    : [];

  if (latestCreatedAt) return { createdAt: latestCreatedAt, symbols: latestSymbols };

  // 2) recentResults에서 최신 묶기
  const recent = ai.recentResults;
  if (!Array.isArray(recent)) return { createdAt: null, symbols: [] };

  let bestAt: Date | null = null;
  const bucket: string[] = [];

  for (const row of recent) {
    if (!isRecord(row)) continue;
    const at = toDate(row.created_at ?? row.createdAt);
    const sym = row.symbol;

    if (!at || typeof sym !== 'string' || sym.length === 0) continue;

    if (!bestAt || at > bestAt) {
      bestAt = at;
      bucket.length = 0;
      bucket.push(sym);
    } else if (bestAt && at.getTime() === bestAt.getTime()) {
      bucket.push(sym);
    }
  }

  return { createdAt: bestAt, symbols: Array.from(new Set(bucket)) };
}

/**
 * ✅ AI 호출 여부 판단 (데이터 변화 기준)
 *
 * ✅ 변경 포인트(핵심):
 * - "새 ingestion_runs가 있으면 무조건 실행" ❌
 * - "AI 이후의 ingestion_runs 중, '의미있는 변화'가 있으면 실행" ✅
 *
 * 쿨다운/예산은 여기서 하지 않는다 → aiBudget.ts
 */
export function shouldCallAIBySnapshot(params: {
  market: Market;
  mode: MarketMode;
  snapshot: Snapshot;
  targets: TargetLike[];
}): boolean {
  const { market, mode, snapshot, targets } = params;

  const targetSymbols = normalizeSymbols(targets);

  const lastAi = extractLastAiInfo(snapshot);

  // 1) 이전 AI 실행 이력이 없으면 실행
  if (!lastAi.createdAt) {
    console.log('[AI] 이전 AI 실행 기록 없음 → 실행');
    return true;
  }

  // 2) 워커 상태 이상(실패/지연)이면 실행
  const hasWorkerIssue = snapshot.services.workers.some((w) => {
    if (w.state === 'failed') return true;
    if (w.state === 'running' && w.last_success_at) {
      const lagMs = Date.now() - new Date(w.last_success_at).getTime();
      return lagMs > 5 * 60 * 1000; // 5분 이상 지연
    }
    return false;
  });

  if (hasWorkerIssue) {
    console.log('[AI] 워커 이상 상태 감지 → 실행');
    return true;
  }

  // 3) "의미있는" 새 ingestion run이 있으면 실행
  const runs = snapshot.ingestion?.recentRuns ?? [];
  if (Array.isArray(runs) && runs.length > 0) {
    for (const run of runs) {
      const check = isMeaningfulNewRun({
        market,
        lastAiAt: lastAi.createdAt,
        targets: targetSymbols,
        run,
      });

      if (check.ok) {
        console.log(`[AI] 의미있는 수집 변화 감지 → 실행 | 이유=${check.reason}`);
        return true;
      }
    }
  }

  // 4) 타겟 목록이 바뀌면 실행
  if (lastAi.symbols.length > 0 && targetSymbols.length > 0) {
    const a = new Set(lastAi.symbols);
    const b = new Set(targetSymbols);

    const changed =
      a.size !== b.size || [...a].some((s) => !b.has(s)) || [...b].some((s) => !a.has(s));

    if (changed) {
      console.log('[AI] 타겟 목록 변경 감지 → 실행');
      return true;
    }
  }

  // 5) 아무 변화도 없으면 스킵
  console.log(`[AI] 데이터 변화 없음 → 스킵 | market=${market} | mode=${mode}`);
  return false;
}
