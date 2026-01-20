'use client';

import { useMemo } from 'react';
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
import { useQueryClient } from '@tanstack/react-query';

function minutesLag(iso: Nullable<string>) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  return Math.max(0, Math.floor(diffMs / 60000));
}

function formatIsoShort(iso: Nullable<string>) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString();
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

export default function DashboardPage() {
  const q = useOpsSnapshot();
  const forceQ = useOpsSnapshotForce();

  const workers = useMemo(() => q.data?.blocks.workerStatus.data ?? [], [q.data]);

  const worstLagMin = useMemo(() => {
    if (workers.length === 0) return null;
    const lags = workers
      .map((w) => minutesLag(w.last_success_at))
      .filter((x): x is number => typeof x === 'number');
    if (lags.length === 0) return null;
    return Math.max(...lags);
  }, [workers]);

  const isForceLoading = forceQ.isFetching;

  const qc = useQueryClient();

  async function onForceRefresh() {
    const res = await forceQ.refetch(); // 1) force=1 호출
    if (!res.data) return;

    // 2) force 결과를 기본 opsSnapshot 캐시에 주입
    qc.setQueryData(['opsSnapshot'], res.data);
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
            </div>

            {forceQ.isError && (
              <div className="text-12 text-destructive">강제 갱신 실패: {String(forceQ.error)}</div>
            )}
          </div>

          <Card className="w-full max-w-sm">
            <CardHeader className="pb-8">
              <CardTitle className="text-14">전체 지연(최대)</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="text-22 font-800">
                {worstLagMin == null ? '-' : `${worstLagMin}분`}
              </div>
              <div className="text-12 text-muted-foreground text-right leading-6">
                <div>화면 갱신: 10초마다</div>
                <div>상태 정보는 최대 3초 전</div>
                <div>실행 기록은 최대 10초 전</div>
              </div>
            </CardContent>
          </Card>
        </div>

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
                      <TableHead className="w-[160px]">실행 모드</TableHead>
                      <TableHead>상태 메시지</TableHead>
                      <TableHead className="w-[220px]">최근 정상 수집</TableHead>
                      <TableHead className="w-[220px]">최근 이벤트</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {workers.map((w: WorkerStatusRow) => {
                      const lagMin = minutesLag(w.last_success_at);

                      return (
                        <TableRow key={w.service}>
                          <TableCell className="font-700">{serviceLabel(w.service)}</TableCell>
                          <TableCell>
                            <Badge variant={stateBadgeVariant(w.state)}>{w.state}</Badge>
                          </TableCell>
                          <TableCell>{lagBadge(lagMin)}</TableCell>
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
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-24">
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
