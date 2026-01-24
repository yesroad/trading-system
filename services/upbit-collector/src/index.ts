import { env } from './utils/env';
import { sleep } from './utils/sleep';
import { supabase } from './supabase';
import { fetchAllMarkets, fetchTickers, fetchMinuteCandles } from './api';
import { pickTopNByTradePrice24h } from './ranking';
import type { UpbitTicker, UpbitMinuteCandle } from './types/upbit';

type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

type WorkerStatusUpsert = {
  service: string;
  state: WorkerState;
  run_mode: string | null;
  message: string | null;
  last_event_at: string | null;
  last_success_at: string | null;
  updated_at: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function timeframeToMinuteUnit(tf: string): number {
  // "1m" "3m" "5m" "15m" ...
  const m = tf.match(/^(\d+)m$/);
  if (!m) throw new Error(`지원하지 않는 UPBIT_TIMEFRAME 형식: ${tf} (예: 1m, 5m)`);
  const unit = Number(m[1]);
  if (!Number.isFinite(unit) || unit <= 0)
    throw new Error(`UPBIT_TIMEFRAME 값이 잘못되었습니다: ${tf}`);
  return unit;
}

async function upsertWorkerStatus(patch: WorkerStatusUpsert): Promise<void> {
  const payload: WorkerStatusUpsert = {
    ...patch,
    updated_at: nowIso(),
  };

  const { error } = await supabase.from('worker_status').upsert(payload, { onConflict: 'service' });
  if (error) throw new Error(`worker_status 저장 실패: ${error.message}`);
}

async function insertIngestionRun(params: {
  job: string;
  symbols: string[]; // 여기서는 markets
  timeframe: string;
  status: 'success' | 'running' | 'failed' | 'skipped';
  inserted_count: number;
  error_message: string | null;
  started_at: string;
  finished_at: string;
}): Promise<void> {
  const { error } = await supabase.from('ingestion_runs').insert({
    job: params.job,
    symbols: params.symbols,
    timeframe: params.timeframe,
    status: params.status,
    inserted_count: params.inserted_count,
    error_message: params.error_message,
    started_at: params.started_at,
    finished_at: params.finished_at,
  });
  if (error) throw new Error(`ingestion_runs 저장 실패: ${error.message}`);
}

async function upsertUpbitCandles(rows: UpbitMinuteCandle[]): Promise<number> {
  if (rows.length === 0) return 0;

  // ✅ upbit_candles 테이블에 맞춰 저장
  // 기대 컬럼 예:
  // market, timeframe, candle_time_kst, open, high, low, close, volume, trade_price, created_at
  const payload = rows.map((c) => ({
    market: c.market,
    timeframe: `${c.unit}m`,
    candle_time_kst: c.candle_date_time_kst,
    candle_time_utc: c.candle_date_time_utc,
    open: c.opening_price,
    high: c.high_price,
    low: c.low_price,
    close: c.trade_price,
    volume: c.candle_acc_trade_volume,
    trade_price: c.candle_acc_trade_price,
    source_timestamp: c.timestamp,
    created_at: nowIso(),
  }));

  const { error, data } = await supabase
    .from('upbit_candles')
    .upsert(payload, { onConflict: 'market,timeframe,candle_time_kst' })
    .select('market');

  if (error) throw new Error(`upbit_candles 저장 실패: ${error.message}`);

  // select 결과 row 수로 inserted/updated 수를 대략 반환
  return Array.isArray(data) ? data.length : rows.length;
}

async function mainLoop(): Promise<void> {
  const serviceName = env.WORKER_SERVICE_NAME;
  const unit = timeframeToMinuteUnit(env.UPBIT_TIMEFRAME);

  let cachedAllKrwMarkets: string[] = [];
  let lastScanAt = 0;
  let topMarkets: string[] = [];

  console.log(
    `[업비트 수집기] 시작: topN=${env.UPBIT_TOP_N}, timeframe=${env.UPBIT_TIMEFRAME}, loop=${env.LOOP_INTERVAL_MS}ms`,
  );

  while (true) {
    const startedAt = nowIso();

    try {
      await upsertWorkerStatus({
        service: serviceName,
        state: 'running',
        run_mode: 'loop',
        message: '수집 루프 실행 중',
        last_event_at: startedAt,
        last_success_at: null,
        updated_at: null,
      });

      // 1) KRW 마켓 전체 스캔 (SCAN_INTERVAL마다 갱신)
      const now = Date.now();
      const needRescan =
        cachedAllKrwMarkets.length === 0 || now - lastScanAt >= env.UPBIT_SCAN_INTERVAL_MS;

      if (needRescan) {
        console.log('[업비트 수집기] KRW 마켓 목록 갱신 중...');
        const markets = await fetchAllMarkets();
        cachedAllKrwMarkets = markets.map((m) => m.market);
        lastScanAt = now;

        console.log(`[업비트 수집기] KRW 마켓 수: ${cachedAllKrwMarkets.length}개`);
      }

      // 2) 티커 전체 조회 → 거래대금 상위 N 선정 (SCAN_INTERVAL마다 같이 갱신해도 되고, 여기서는 매 루프마다 갱신해도 됨)
      //    부하를 줄이려면 “needRescan일 때만” top을 갱신하는 걸 추천.
      if (needRescan || topMarkets.length === 0) {
        console.log('[업비트 수집기] KRW 티커 조회 후 상위 종목 선정 중...');
        const tickers: UpbitTicker[] = await fetchTickers(cachedAllKrwMarkets);
        const top = pickTopNByTradePrice24h(tickers, env.UPBIT_TOP_N);
        topMarkets = top.map((t) => t.market);

        console.log(`[업비트 수집기] 상위 ${env.UPBIT_TOP_N}개 선정 완료`);
        console.log(`[업비트 수집기] 예시: ${topMarkets.slice(0, 5).join(', ')} ...`);
      }

      // 3) 상위 N개만 캔들 최신 N개 수집
      let insertedTotal = 0;

      // 너무 공격적으로 때리면 제한 걸릴 수 있어서, 30개를 한 번에 다 치지 말고 약간 텀을 준다.
      for (const market of topMarkets) {
        const candles = await fetchMinuteCandles({
          market,
          unit,
          count: env.UPBIT_CANDLE_LIMIT,
        });

        // 최신이 앞에 오니까, DB upsert는 그대로 넣어도 됨
        const inserted = await upsertUpbitCandles(candles);
        insertedTotal += inserted;

        // 요청 간 간격(부하/레이트리밋 완화)
        await sleep(120);
      }

      const finishedAt = nowIso();

      await insertIngestionRun({
        job: 'upbit-candle',
        symbols: topMarkets,
        timeframe: env.UPBIT_TIMEFRAME,
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
        message: `정상 완료 (상위 ${env.UPBIT_TOP_N}개 캔들 수집)`,
        last_event_at: finishedAt,
        last_success_at: finishedAt,
        updated_at: null,
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
          timeframe: env.UPBIT_TIMEFRAME,
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
          service: env.WORKER_SERVICE_NAME,
          state: 'failed',
          run_mode: 'loop',
          message: msg,
          last_event_at: finishedAt,
          last_success_at: null,
          updated_at: null,
        });
      } catch (inner: unknown) {
        const innerMsg = inner instanceof Error ? inner.message : String(inner);
        console.error(`[업비트 수집기] worker_status 저장 실패: ${innerMsg}`);
      }
    }

    await sleep(env.LOOP_INTERVAL_MS);
  }
}

mainLoop().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[업비트 수집기] 치명적 오류로 종료: ${msg}`);
  process.exit(1);
});
