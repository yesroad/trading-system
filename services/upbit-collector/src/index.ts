import { env } from './utils/env';
import { sleep } from './utils/sleep';
import { supabase } from './supabase';
import { fetchAllMarkets, fetchTickers, fetchMinuteCandles } from './api';
import { pickTopNByTradePrice24h } from './ranking';
import type { UpbitTicker, UpbitMinuteCandle } from './types/upbit';

type WorkerState = 'unknown' | 'running' | 'success' | 'failed' | 'skipped';

/**
 * worker_status 테이블 업서트 payload
 * - running 상태에서는 last_success_at 같은 값은 "유지"하고 싶어서 optional로 둔다.
 */
type WorkerStatusUpsert = {
  service: string;
  state: WorkerState;
  run_mode?: string | null;
  message?: string | null;
  last_event_at?: string | null;
  last_success_at?: string | null;
  updated_at?: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

// Upbit의 candle_date_time_utc는 보통 타임존 표시(Z)가 없는 형태라서,
// DB(timestamptz) 저장/변환 시 UTC로 명확히 해준다.
function normalizeUtcIso(utcLike: string): string {
  // 이미 Z 또는 오프셋(+09:00 등)이 있으면 그대로 사용
  if (utcLike.endsWith('Z')) return utcLike;
  if (/[+-]\d{2}:\d{2}$/.test(utcLike)) return utcLike;
  return `${utcLike}Z`;
}

// UTC ISO → KST 로컬 시각 문자열(YYYY-MM-DD HH:mm:ss)
// (DB의 candle_time_kst 컬럼을 timestamp(타임존 없음)으로 쓰기 위한 값)
function utcIsoToKstLocalTimestamp(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`시간 파싱 실패(UTC): ${utcIso}`);
  }

  // sv-SE 로케일은 "YYYY-MM-DD HH:mm:ss" 형태로 안정적으로 반환
  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  });
}

// ISO 문자열(UTC/Z 포함) 중 더 최신(큰) 값을 고른다.
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
  // "1m" "3m" "5m" "15m" ...
  const m = tf.match(/^(\d+)m$/);
  if (!m) throw new Error(`지원하지 않는 UPBIT_TIMEFRAME 형식: ${tf} (예: 1m, 5m)`);
  const unit = Number(m[1]);
  if (!Number.isFinite(unit) || unit <= 0)
    throw new Error(`UPBIT_TIMEFRAME 값이 잘못되었습니다: ${tf}`);
  return unit;
}

/**
 * worker_status 업서트
 * - undefined는 payload에 넣지 않아서 "기존 값 유지"가 가능하게 한다.
 */
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

  const payload = rows.map((c) => {
    const candleTimeUtc = normalizeUtcIso(c.candle_date_time_utc);
    const candleTimeKst = utcIsoToKstLocalTimestamp(candleTimeUtc);

    return {
      market: c.market,
      timeframe: `${c.unit}m`,
      candle_time_kst: candleTimeKst, // timestamp (tz 없음)로 저장
      candle_time_utc: candleTimeUtc, // timestamptz (UTC 명시)로 저장
      open: c.opening_price,
      high: c.high_price,
      low: c.low_price,
      close: c.trade_price,
      volume: c.candle_acc_trade_volume,
      trade_price: c.candle_acc_trade_price,
      source_timestamp: c.timestamp,
      created_at: nowIso(),
    };
  });

  // 중요: onConflict 컬럼 조합과 DB의 UNIQUE(또는 CONSTRAINT) 조합이 정확히 일치해야 함
  const { error, data } = await supabase
    .from('upbit_candles')
    .upsert(payload, { onConflict: 'market,timeframe,candle_time_utc' })
    .select('market');

  if (error) throw new Error(`upbit_candles 저장 실패: ${error.message}`);

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
        // running 때 last_success_at을 null로 덮어쓰지 않기 위해 아예 보내지 않는다.
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

      // 2) 티커 전체 조회 → 거래대금 상위 N 선정
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

      // ✅ 이번 루프에서 "가장 최신 캔들 시각(UTC)"을 추적해서
      // worker_status.last_success_at에 반영한다.
      let latestCandleUtcThisLoop: string | null = null;

      for (const market of topMarkets) {
        const candles = await fetchMinuteCandles({
          market,
          unit,
          count: env.UPBIT_CANDLE_LIMIT,
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

    await sleep(env.LOOP_INTERVAL_MS);
  }
}

mainLoop().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[업비트 수집기] 치명적 오류로 종료: ${msg}`);
  process.exit(1);
});
