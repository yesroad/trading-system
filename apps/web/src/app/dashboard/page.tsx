'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOpsSnapshot, useOpsSnapshotForce } from '@/queries/useOpsSnapshot';
import type { WorkerStatusRow } from '@/types/ops';
import type { Nullable } from '@/types/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

function minutesLag(iso: Nullable<string>) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.max(0, Math.floor(diffMs / 60000));
}

/** ✅ 1) 시간 표기 KST 고정 */
function formatIsoShort(iso: Nullable<string>) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function stateBadgeVariant(state: string) {
  if (state === 'success') return 'default';
  if (state === 'running') return 'secondary';
  if (state === 'skipped') return 'outline';
  return 'destructive';
}

function lagBadge(lagMin: Nullable<number>) {
  if (lagMin == null) return <Badge variant="outline">-</Badge>;
  if (lagMin <= 1) return <Badge variant="default">{lagMin}분</Badge>;
  if (lagMin <= 5) return <Badge variant="secondary">{lagMin}분</Badge>;
  return <Badge variant="destructive">{lagMin}분</Badge>;
}

/** 서비스 표시명 (운영자용) */
function serviceLabel(service: string) {
  switch (service) {
    case 'kis-collector':
      return '🇰🇷 국내주식 수집';
    case 'yf-collector':
      return '🇺🇸 해외주식 수집';
    case 'ai-analyzer':
      return '🤖 AI 판단';
    case 'trade-executor':
      return '💰 매매 실행';
    default:
      return service;
  }
}

function isOffMarketMessage(msg: Nullable<string>) {
  const m = (msg ?? '').toLowerCase();
  return (
    m.includes('장외') ||
    m.includes('정규장') ||
    m.includes('off market') ||
    m.includes('market closed')
  );
}

function reasonBadge(w: WorkerStatusRow, lagMin: Nullable<number>) {
  if (w.state === 'failed') return <Badge variant="destructive">장애</Badge>;
  if (w.state === 'running') return <Badge variant="secondary">수집중</Badge>;
  if (w.state === 'skipped' && isOffMarketMessage(w.message))
    return <Badge variant="outline">장외</Badge>;
  if (lagMin != null && lagMin > 5) return <Badge variant="destructive">지연</Badge>;
  if (lagMin != null && lagMin > 1) return <Badge variant="secondary">느림</Badge>;
  if (w.state === 'success') return <Badge variant="default">정상</Badge>;
  return <Badge variant="outline">확인필요</Badge>;
}

function serviceLagBadges(params: {
  lagByService: Record<string, number | null> | null | undefined;
  workers: WorkerStatusRow[];
}) {
  const { lagByService, workers } = params;
  if (!lagByService) return null;

  const lastSuccessByService = new Map<string, Nullable<string>>();
  for (const w of workers) lastSuccessByService.set(w.service, w.last_success_at);

  const entries = Object.entries(lagByService);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-10">
      {entries.map(([service, lag]) => {
        const lastSuccessAt = lastSuccessByService.get(service) ?? null;
        return (
          <div key={service} className="flex items-center gap-6">
            <div className="flex flex-col gap-2">
              <span className="text-12 text-muted-foreground">{serviceLabel(service)}</span>
              <span className="text-11 text-muted-foreground">
                마지막 정상: {formatIsoShort(lastSuccessAt)}
              </span>
            </div>
            {lagBadge(lag == null ? null : lag)}
          </div>
        );
      })}
    </div>
  );
}

/** ✅ 2) 장외/미수집/장애 구분해서 운영 요약 문구 결정 */
function overallStatusFromSnapshot(params: {
  worstLagMin: Nullable<number>;
  workers: WorkerStatusRow[];
}) {
  const { worstLagMin, workers } = params;

  if (workers.length === 0) {
    return {
      variant: 'outline' as const,
      label: '정보 없음',
      desc: '상태 데이터가 없습니다.',
    };
  }

  const hasFailed = workers.some((w) => w.state === 'failed');
  const hasRunning = workers.some((w) => w.state === 'running');
  const hasSuccess = workers.some((w) => w.state === 'success');

  const allSkipped = workers.every((w) => w.state === 'skipped');
  const skippedOffMarket = allSkipped && workers.every((w) => isOffMarketMessage(w.message));

  if (hasFailed) {
    return {
      variant: 'destructive' as const,
      label: '장애 의심',
      desc: '실패 상태가 감지되었습니다. 워커 메시지/로그를 우선 확인하세요.',
    };
  }

  // 수집이 돌아가고 있는데 아직 정상(success) 기록이 없다면 "수집중"으로
  if (hasRunning && !hasSuccess) {
    return {
      variant: 'secondary' as const,
      label: '수집중',
      desc: '수집이 진행 중입니다. 정상 수집 기록이 쌓이는지 확인하세요.',
    };
  }

  // 장외로 스킵이면 문제로 보지 않기
  if (skippedOffMarket) {
    return {
      variant: 'outline' as const,
      label: '장외',
      desc: '장외 시간이라 수집이 스킵되었습니다. 장 시작 후 정상 수집으로 전환됩니다.',
    };
  }

  const hasLagIssue =
    worstLagMin != null &&
    worstLagMin > 5 &&
    !skippedOffMarket &&
    !workers.every((w) => w.state === 'skipped');

  if (hasLagIssue) {
    return {
      variant: 'destructive' as const,
      label: '지연 큼',
      desc: '장외가 아닌데 지연이 큽니다. 수집 워커가 실제로 돌고 있는지부터 확인하세요.',
    };
  }

  // worstLag가 null이면 success 기록이 아직 없는 상태(혹은 데이터가 부족)
  if (worstLagMin == null) {
    return {
      variant: 'outline' as const,
      label: '정보 없음',
      desc: '아직 정상 수집 기록이 없습니다. 워커가 실행 중인지 확인하세요.',
    };
  }

  if (worstLagMin <= 1) {
    return {
      variant: 'default' as const,
      label: '정상',
      desc: '모든 수집이 정상 범위로 동작 중입니다.',
    };
  }
  if (worstLagMin <= 5) {
    return {
      variant: 'secondary' as const,
      label: '주의',
      desc: '일부 수집이 지연되고 있습니다. 워커 상태를 확인하세요.',
    };
  }
  return {
    variant: 'destructive' as const,
    label: '위험',
    desc: '지연이 큽니다. 수집/분석 상태를 우선 확인하세요.',
  };
}

/** "__ALL__" 같은 시스템 심볼은 사람이 이해하기 쉽게 변환 */
function symbolLabel(symbol: string) {
  return symbol === '__ALL__' ? '전체 시장' : symbol;
}

function symbolBadge(symbol: string) {
  if (symbol === '__ALL__') return <Badge variant="secondary">전체</Badge>;
  return <Badge variant="outline">{symbol}</Badge>;
}

/** job 식별자를 화면 라벨로 변환 */
function jobLabel(job: string) {
  if (job === 'yfinance-equity') return '해외주식 시세 수집';
  if (job === 'kis-equity') return '국내주식 시세 수집';
  return job;
}

/** timeframe 표기 통일 */
function timeframeLabel(tf: Nullable<string>) {
  if (!tf) return '-';
  if (tf === '1m') return '1분봉';
  if (tf === '5m') return '5분봉';
  if (tf === '15m') return '15분봉';
  if (tf === '1h') return '1시간봉';
  if (tf === '1d') return '일봉';
  return tf;
}

function joinSymbols(symbols: string[] | null | undefined) {
  const arr = (symbols ?? []).filter(Boolean);
  if (arr.length === 0) return '-';
  return arr.join(', ');
}

type ForceNotice = { kind: 'success'; text: string } | { kind: 'error'; text: string } | null;

export default function DashboardPage() {
  const q = useOpsSnapshot();
  const forceQ = useOpsSnapshotForce();
  const qc = useQueryClient();

  const workers = useMemo(() => q.data?.blocks.workerStatus.data ?? [], [q.data]);

  const workersSorted = useMemo(() => {
    const priority = (w: WorkerStatusRow) => {
      const lag = minutesLag(w.last_success_at);
      if (w.state === 'failed') return 0;
      if (w.state === 'running') return 1;
      if (w.state === 'skipped' && isOffMarketMessage(w.message)) return 4; // 장외는 뒤로
      if (lag != null && lag > 5) return 2; // 지연 큰 것
      if (lag != null && lag > 1) return 3; // 살짝 느린 것
      if (w.state === 'unknown') return 5;
      if (w.state === 'skipped') return 6;
      return 7; // success
    };

    return [...workers].sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      return a.service.localeCompare(b.service);
    });
  }, [workers]);

  const worstLagMin = useMemo(() => {
    const serverLag = q.data?.meta.lagMinutesMax;
    if (typeof serverLag === 'number') return serverLag;

    // fallback (혹시 서버에서 아직 안 내려오는 환경)
    if (workers.length === 0) return null;
    const lags = workers
      .map((w) => minutesLag(w.last_success_at))
      .filter((x): x is number => typeof x === 'number');
    if (lags.length === 0) return null;
    return Math.max(...lags);
  }, [q.data?.meta.lagMinutesMax, workers]);

  const overall = useMemo(
    () => overallStatusFromSnapshot({ worstLagMin, workers }),
    [worstLagMin, workers],
  );

  const isForceLoading = forceQ.isFetching;

  /** ✅ 4) 강제갱신 UX: 성공 토스트(2초), 실패 메시지 + 재시도 */
  const [forceNotice, setForceNotice] = useState<ForceNotice>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  function showNotice(n: ForceNotice) {
    setForceNotice(n);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    if (n?.kind === 'success') {
      timerRef.current = window.setTimeout(() => setForceNotice(null), 2000);
    }
  }

  async function onForceRefresh() {
    try {
      const res = await forceQ.refetch(); // force=1 호출
      if (!res.data) return;

      // force 결과를 기본 opsSnapshot 캐시에 주입(덮어쓰기)
      qc.setQueryData(['opsSnapshot'], res.data);

      showNotice({ kind: 'success', text: '방금 갱신됨' });
    } catch (e: any) {
      showNotice({ kind: 'error', text: `강제 갱신 실패: ${String(e?.message ?? e)}` });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl p-16 space-y-16">
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-12">
          <div className="space-y-4">
            <div className="text-24 font-700 tracking-tight">운영 대시보드</div>
            <div className="text-14 text-muted-foreground">
              이 화면은 “스냅샷”으로 조회합니다. (빠르고 안정적)
            </div>

            <div className="flex items-center gap-8 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onForceRefresh}
                disabled={isForceLoading}
              >
                {isForceLoading ? '강제 갱신 중…' : '강제 갱신'}
              </Button>

              <div className="text-12 text-muted-foreground">
                {q.data ? (
                  <>
                    캐시 상태: {q.data.meta.cacheHit ? '캐시' : '새로 조회'} · 대표 TTL:{' '}
                    {q.data.meta.ttlSeconds ?? '-'}초
                  </>
                ) : (
                  '캐시 상태: -'
                )}
              </div>

              {forceNotice?.kind === 'success' && (
                <div className="text-12 text-muted-foreground">{forceNotice.text}</div>
              )}

              {(forceNotice?.kind === 'error' || forceQ.isError) && (
                <div className="flex items-center gap-6">
                  <div className="text-12 text-destructive">
                    {forceNotice?.kind === 'error'
                      ? forceNotice.text
                      : `강제 갱신 실패: ${String(forceQ.error)}`}
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={onForceRefresh}>
                    재시도
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* ✅ 3) 중복 제거: 헤더 우측 카드는 "최대 지연" 대신 "갱신/생성 정보"로 역할 변경 */}
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-8">
              <CardTitle className="text-14">스냅샷 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-12 text-muted-foreground leading-6">
                <div>자동 갱신: 10초마다</div>
                <div>상태 정보 TTL: 3초</div>
                <div>실행 기록 TTL: 10초</div>
              </div>

              <div className="text-12 text-muted-foreground leading-6">
                <div>스냅샷 생성: {q.data ? formatIsoShort(q.data.meta.generatedAt) : '-'}</div>
                <div>강제 갱신 여부: {q.data ? (q.data.meta.force ? '예' : '아니오') : '-'}</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 운영 요약 바 (한눈에 상태 판단) */}
        {q.data && (
          <Card>
            <CardContent className="py-12">
              <div className="flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
                <div className="space-y-3">
                  <div className="text-14 font-700">전체 시스템 상태</div>
                  <div className="text-13 text-muted-foreground">{overall.desc}</div>
                  <div className="text-12 text-muted-foreground">
                    기준 시각: {formatIsoShort(q.data.meta.generatedAt)}
                  </div>
                </div>

                <div className="flex items-center gap-8">
                  <Badge variant={overall.variant}>{overall.label}</Badge>
                  <div className="text-13 font-800">
                    최대 지연 {worstLagMin == null ? '-' : `${worstLagMin}분`}
                  </div>
                </div>
              </div>

              <div className="mt-10">
                {serviceLagBadges({ lagByService: q.data.meta.lagByService, workers })}
              </div>

              <div className="mt-10 text-12 text-muted-foreground">
                화면은 10초마다 자동 갱신되며, 강제 갱신 버튼으로 즉시 업데이트할 수 있습니다.
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* 로딩/에러 */}
        {q.isLoading && (
          <div className="grid gap-12 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-8">
                <CardTitle className="text-14">수집/AI 상태</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-8">
                <CardTitle className="text-14">최근 실행 기록</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          </div>
        )}

        {q.isError && (
          <Alert variant="destructive">
            <AlertTitle>조회 실패</AlertTitle>
            <AlertDescription>{String(q.error)}</AlertDescription>
          </Alert>
        )}

        {/* 메인 */}
        {q.data && (
          <div className="grid gap-12 lg:grid-cols-2">
            {/* 워커 상태 */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-8 flex flex-row items-center justify-between">
                <CardTitle className="text-14">현재 상태</CardTitle>
                <div className="text-12 text-muted-foreground">
                  스냅샷 생성: {formatIsoShort(q.data.meta.generatedAt)}
                </div>
              </CardHeader>

              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[220px]">구분</TableHead>
                      <TableHead className="w-[120px]">상태</TableHead>
                      <TableHead className="w-[120px]">지연</TableHead>
                      <TableHead className="w-[120px]">원인</TableHead>
                      <TableHead className="w-[160px]">실행 모드</TableHead>
                      <TableHead>상태 메시지</TableHead>
                      <TableHead className="w-[220px]">최근 정상 수집</TableHead>
                      <TableHead className="w-[220px]">최근 이벤트</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {workersSorted.map((w: WorkerStatusRow) => {
                      const lagMin = minutesLag(w.last_success_at);

                      return (
                        <TableRow key={w.service}>
                          <TableCell className="font-700">{serviceLabel(w.service)}</TableCell>
                          <TableCell>
                            <Badge variant={stateBadgeVariant(w.state)}>{w.state}</Badge>
                          </TableCell>
                          <TableCell>{lagBadge(lagMin)}</TableCell>
                          <TableCell>{reasonBadge(w, lagMin)}</TableCell>
                          <TableCell className="text-13">{w.run_mode ?? '-'}</TableCell>
                          <TableCell className="text-13 text-muted-foreground">
                            {w.message ?? '-'}
                          </TableCell>
                          <TableCell className="text-13">
                            {formatIsoShort(w.last_success_at)}
                          </TableCell>
                          <TableCell className="text-13">
                            {formatIsoShort(w.last_event_at)}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {workers.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-24">
                          상태 데이터가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                <div className="mt-10 text-12 text-muted-foreground">
                  상태 기준 시각: {formatIsoShort(q.data.blocks.workerStatus.generatedAt)}
                </div>
              </CardContent>
            </Card>

            {/* 최근 수집 기록 (ingestion_runs) */}
            <Card>
              <CardHeader className="pb-8 flex flex-row items-center justify-between">
                <CardTitle className="text-14">최근 수집 기록</CardTitle>
                <div className="text-12 text-muted-foreground">
                  기준 시각: {formatIsoShort(q.data.blocks.ingestionRuns.generatedAt)}
                </div>
              </CardHeader>

              <CardContent className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>작업</TableHead>
                      <TableHead className="w-[110px]">결과</TableHead>
                      <TableHead className="w-[100px] text-right">저장</TableHead>
                      <TableHead className="w-[200px]">시작</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {q.data.blocks.ingestionRuns.data.slice(0, 10).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-13">
                          <div className="font-800">{jobLabel(r.job)}</div>
                          <div className="text-12 text-muted-foreground">
                            대상: {joinSymbols(r.symbols)} · 주기: {timeframeLabel(r.timeframe)}
                          </div>
                        </TableCell>

                        <TableCell>
                          <Badge
                            variant={
                              r.status === 'success'
                                ? 'default'
                                : r.status === 'running'
                                  ? 'secondary'
                                  : 'destructive'
                            }
                          >
                            {r.status}
                          </Badge>
                        </TableCell>

                        <TableCell className="text-right text-13">
                          {r.inserted_count ?? 0}
                        </TableCell>

                        <TableCell className="text-13">{formatIsoShort(r.started_at)}</TableCell>
                      </TableRow>
                    ))}

                    {q.data.blocks.ingestionRuns.data.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-24">
                          수집 기록이 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* 최근 AI/분석 (analysis_runs + ai_results) */}
            <Card>
              <CardHeader className="pb-8 flex flex-row items-center justify-between">
                <CardTitle className="text-14">최근 AI 판단/분석</CardTitle>
                <div className="text-12 text-muted-foreground">
                  기준 시각: {formatIsoShort(q.data.blocks.analysisRuns.generatedAt)}
                </div>
              </CardHeader>

              <CardContent className="space-y-12">
                {/* 분석 실행 기록 */}
                <div className="space-y-6">
                  <div className="text-13 font-800">AI 실행 기록</div>

                  <div className="rounded-12 border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>대상</TableHead>
                          <TableHead className="w-[110px]">결과</TableHead>
                          <TableHead className="w-[120px] text-right">응답(ms)</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {q.data.blocks.analysisRuns.data.slice(0, 8).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-13">
                              <div className="flex items-center gap-6">
                                {symbolBadge(r.symbol)}
                                <span className="font-800">{symbolLabel(r.symbol)}</span>
                              </div>
                              <div className="text-12 text-muted-foreground">
                                시장: {r.market} · {formatIsoShort(r.created_at)}
                              </div>
                              {r.skip_reason && (
                                <div className="text-12 text-muted-foreground">
                                  스킵 사유: {r.skip_reason}
                                </div>
                              )}
                            </TableCell>

                            <TableCell>
                              <Badge
                                variant={
                                  r.status === 'success'
                                    ? 'default'
                                    : r.status === 'skipped'
                                      ? 'outline'
                                      : 'destructive'
                                }
                              >
                                {r.status}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right text-13">
                              {r.latency_ms == null ? '-' : `${r.latency_ms}`}
                            </TableCell>
                          </TableRow>
                        ))}

                        {q.data.blocks.analysisRuns.data.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="text-center text-muted-foreground py-24"
                            >
                              AI 실행 기록이 없습니다.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* ai_analysis_results */}
                <div className="space-y-6">
                  <div className="text-13 font-800">AI 판단 결과</div>

                  <div className="rounded-12 border overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>대상</TableHead>
                          <TableHead className="w-[120px]">판단</TableHead>
                          <TableHead className="w-[120px] text-right">신뢰도</TableHead>
                        </TableRow>
                      </TableHeader>

                      <TableBody>
                        {q.data.blocks.aiResults.data.slice(0, 8).map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-13">
                              <div className="flex items-center gap-6">
                                {symbolBadge(r.symbol)}
                                <span className="font-800">{symbolLabel(r.symbol)}</span>
                              </div>
                              <div className="text-12 text-muted-foreground">
                                시장: {r.market} · 기준: {formatIsoShort(r.window_end)}
                              </div>
                            </TableCell>

                            <TableCell>
                              <Badge
                                variant={
                                  r.decision === 'ALLOW'
                                    ? 'default'
                                    : r.decision === 'CAUTION'
                                      ? 'secondary'
                                      : 'destructive'
                                }
                              >
                                {r.decision}
                              </Badge>
                            </TableCell>

                            <TableCell className="text-right text-13">
                              {r.confidence == null ? '-' : r.confidence.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))}

                        {q.data.blocks.aiResults.data.length === 0 && (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="text-center text-muted-foreground py-24"
                            >
                              AI 판단 결과가 없습니다.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="text-12 text-muted-foreground">
          * 이 화면은 운영 확인용 최소 UI입니다. (나중에 템플릿 교체 가능)
        </div>
      </div>
    </div>
  );
}
