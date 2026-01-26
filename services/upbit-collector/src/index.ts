import { env } from './utils/env';
import { sleep } from './utils/sleep';
import { fetchAllMarkets, fetchTickers, fetchMinuteCandles, fetchKRWBalance } from './api';
import { upsertUpbitCandles, upsertWorkerStatus, insertIngestionRun } from './db/db';
import { loadCryptoPositions } from './positions';
import { loadSymbolUniverse } from './symbolUniverse';
import { selectAutoCandidates } from './autoCandidates';
import type { UpbitTicker } from './types/upbit';

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeUtcIso(utcLike: string): string {
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

function pickLaterIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return ta >= tb ? a : b;
}

function timeframeToMinuteUnit(tf: string): number {
  const m = tf.match(/^(\d+)m$/);
  if (!m) throw new Error(`지원하지 않는 UPBIT_TIMEFRAME 형식: ${tf} (예: 1m, 5m)`);
  const unit = Number(m[1]);
  if (!Number.isFinite(unit) || unit <= 0)
    throw new Error(`UPBIT_TIMEFRAME 값이 잘못되었습니다: ${tf}`);
  return unit;
}

async function mainLoop(): Promise<void> {
  const serviceName = env('WORKER_SERVICE_NAME') || 'upbit-collector';
  const timeframe = env('UPBIT_TIMEFRAME') || '1m';
  const unit = timeframeToMinuteUnit(timeframe);
  const topN = Number(env('UPBIT_TOP_N') || '30');
  const scanInterval = Number(env('UPBIT_SCAN_INTERVAL_MS') || '60000');
  const candleLimit = Number(env('UPBIT_CANDLE_LIMIT') || '3');
  const loopInterval = Number(env('LOOP_INTERVAL_MS') || '10000');

  let cachedAllKrwMarkets: string[] = [];
  let lastScanAt = 0;
  let topMarkets: string[] = [];

  console.log(`[업비트 수집기] 시작: topN=${topN}, timeframe=${timeframe}, loop=${loopInterval}ms`);

  while (true) {
    const startedAt = nowIso();

    try {
      await upsertWorkerStatus({
        service: serviceName,
        state: 'running',
        run_mode: 'loop',
        message: '수집 루프 실행 중',
        last_event_at: startedAt,
        // running 때 last_success_at을 null로 덮어쓰지 않기 위해 아예 보내지 않는다.
      });

      // 1) KRW 마켓 전체 스캔 (SCAN_INTERVAL마다 갱신)
      const now = Date.now();
      const needRescan = cachedAllKrwMarkets.length === 0 || now - lastScanAt >= scanInterval;

      if (needRescan) {
        const markets = await fetchAllMarkets();
        cachedAllKrwMarkets = markets.map((m) => m.market);
        lastScanAt = now;
      }

      // 2) 우선순위 기반 타겟 선정 (매수 가능한 코인만)
      if (needRescan || topMarkets.length === 0) {
        // 2-1) KRW 잔액 조회
        let krwBalance = 0;
        try {
          krwBalance = await fetchKRWBalance();
          console.log(`[업비트 수집기] KRW 잔액: ${Math.floor(krwBalance).toLocaleString()}원`);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[업비트 수집기] KRW 잔액 조회 실패: ${msg}`);
        }

        // 2-2) 보유 코인 조회 (우선순위 1)
        const positions = await loadCryptoPositions({ broker: 'UPBIT' });
        const positionSymbols = new Set(positions.map((p) => p.symbol));

        // 2-3) DB 등록 코인 조회 (우선순위 2)
        const symbolUniverse = await loadSymbolUniverse({ market: 'CRYPTO' });
        const universeSymbols = new Set(symbolUniverse.map((s) => s.symbol));

        // 2-4) 전체 티커 조회
        const tickers: UpbitTicker[] = await fetchTickers(cachedAllKrwMarkets);

        // 티커를 Map으로 변환 (심볼별 현재가 조회용)
        const tickerMap = new Map<string, UpbitTicker>();
        for (const t of tickers) {
          const symbol = t.market.replace('KRW-', '');
          tickerMap.set(symbol, t);
        }

        // 2-5) 우선순위별 타겟 선정
        const selectedSymbols = new Set<string>();
        const selectedMarkets: string[] = [];

        // 우선순위 1: 보유 코인 (매수 가능 여부 체크)
        for (const symbol of positionSymbols) {
          if (selectedSymbols.size >= topN) break;

          const ticker = tickerMap.get(symbol);
          if (!ticker) continue;

          // 매수 가능 여부 체크
          if (ticker.trade_price > krwBalance) continue;

          selectedSymbols.add(symbol);
          selectedMarkets.push(`KRW-${symbol}`);
        }

        // 우선순위 2: DB 등록 코인 (보유 코인 제외, 매수 가능 여부 체크)
        for (const symbol of universeSymbols) {
          if (selectedSymbols.size >= topN) break;
          if (selectedSymbols.has(symbol)) continue; // 이미 선정됨

          const ticker = tickerMap.get(symbol);
          if (!ticker) continue;

          // 매수 가능 여부 체크
          if (ticker.trade_price > krwBalance) continue;

          selectedSymbols.add(symbol);
          selectedMarkets.push(`KRW-${symbol}`);
        }

        // 우선순위 3: 자동 후보 (거래대금 상위, 이미 선정된 코인 제외, 매수 가능 여부 체크)
        const remainingSlots = Math.max(0, topN - selectedSymbols.size);
        if (remainingSlots > 0) {
          const autoCandidates = selectAutoCandidates({
            allTickers: tickers,
            excludeSymbols: selectedSymbols,
            limit: remainingSlots,
            krwBalance,
          });

          for (const c of autoCandidates) {
            selectedMarkets.push(c.market);
            selectedSymbols.add(c.symbol);
          }
        }

        topMarkets = selectedMarkets;

        // 실제 선정된 개수 계산
        const positionCount = Array.from(selectedSymbols).filter((s) => positionSymbols.has(s))
          .length;
        const universeCount = Array.from(selectedSymbols).filter(
          (s) => !positionSymbols.has(s) && universeSymbols.has(s),
        ).length;
        const autoCount = selectedSymbols.size - positionCount - universeCount;

        console.log(
          `[업비트 수집기] 수집 대상 ${topMarkets.length}개 선정 (보유 ${positionCount} + DB ${universeCount} + 자동 ${autoCount})`,
        );
      }

      // 3) 상위 N개만 캔들 최신 N개 수집
      let insertedTotal = 0;

      // ✅ 이번 루프에서 "가장 최신 캔들 시각(UTC)"을 추적해서
      // worker_status.last_success_at에 반영한다.
      let latestCandleUtcThisLoop: string | null = null;

      for (const market of topMarkets) {
        const candles = await fetchMinuteCandles({
          market,
          unit,
          count: candleLimit,
        });

        // Upbit minute candle은 보통 최신이 앞에 옴.
        // 안전하게 candle_date_time_utc를 normalize 해서 최신값으로 기록.
        if (candles.length > 0) {
          const latest = normalizeUtcIso(candles[0].candle_date_time_utc);
          latestCandleUtcThisLoop = pickLaterIso(latestCandleUtcThisLoop, latest);
        }

        const inserted = await upsertUpbitCandles(candles);
        insertedTotal += inserted;

        // 요청 간 간격(부하/레이트리밋 완화)
        await sleep(120);
      }

      const finishedAt = nowIso();

      await insertIngestionRun({
        job: 'upbit-candle',
        symbols: topMarkets,
        timeframe,
        status: 'success',
        inserted_count: insertedTotal,
        error_message: null,
        started_at: startedAt,
        finished_at: finishedAt,
      });

      await upsertWorkerStatus({
        service: serviceName,
        state: 'success',
        run_mode: 'loop',
        message: `정상 완료 (상위 ${topN}개 캔들 수집)`,
        last_event_at: finishedAt,
        // ✅ "루프 종료 시간"이 아니라 "데이터 최신 시각"을 성공 시각으로 기록
        last_success_at: latestCandleUtcThisLoop ?? finishedAt,
      });

      console.log(`[업비트 수집기] 정상 완료: 저장=${insertedTotal}건, 다음 실행까지 대기...`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const finishedAt = nowIso();

      console.error(`[업비트 수집기] 오류 발생: ${msg}`);

      // ingestion_runs 기록
      try {
        await insertIngestionRun({
          job: 'upbit-candle',
          symbols: topMarkets,
          timeframe,
          status: 'failed',
          inserted_count: 0,
          error_message: msg,
          started_at: startedAt,
          finished_at: finishedAt,
        });
      } catch (inner: unknown) {
        const innerMsg = inner instanceof Error ? inner.message : String(inner);
        console.error(`[업비트 수집기] 실패 기록 저장도 실패: ${innerMsg}`);
      }

      // worker status 기록
      try {
        await upsertWorkerStatus({
          service: serviceName,
          state: 'failed',
          run_mode: 'loop',
          message: msg,
          last_event_at: finishedAt,
          // 실패 시엔 last_success_at을 굳이 null로 덮지 말고 유지하고 싶으면 생략하는 게 더 운영 친화적
          // (원하면 null로 덮는 방식으로 바꿀 수 있음)
        });
      } catch (inner: unknown) {
        const innerMsg = inner instanceof Error ? inner.message : String(inner);
        console.error(`[업비트 수집기] worker_status 저장 실패: ${innerMsg}`);
      }
    }

    await sleep(loopInterval);
  }
}

mainLoop().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[업비트 수집기] 치명적 오류로 종료: ${msg}`);
  process.exit(1);
});
