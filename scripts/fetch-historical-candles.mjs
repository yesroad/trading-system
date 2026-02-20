/**
 * 역사 일봉 데이터 수집 스크립트
 *
 * 사용법:
 *   YF:  node scripts/fetch-historical-candles.mjs yf  AAPL NVDA MSFT
 *   KIS: node scripts/fetch-historical-candles.mjs kis 005930 000660
 *
 * 환경변수: services/backtest-engine/.env (SUPABASE_URL, SUPABASE_KEY)
 *           services/kis-collector/.env   (KIS_APP_KEY, KIS_APP_SECRET 등)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── 환경변수 로드 ─────────────────────────────────────────────
function loadEnv(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // 파일 없으면 무시
  }
}

loadEnv(join(__dir, '../services/backtest-engine/.env'));
loadEnv(join(__dir, '../services/kis-collector/.env'));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_KEY 환경변수 필요');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── YF (Yahoo Finance) ───────────────────────────────────────
async function fetchYfDaily(symbol, startDate, endDate) {
  const p1 = Math.floor(new Date(startDate).getTime() / 1000);
  const p2 = Math.floor(new Date(endDate).getTime() / 1000);

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&period1=${p1}&period2=${p2}&includePrePost=false`;

  console.log(`  [YF] 요청: ${symbol} ${startDate} ~ ${endDate}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  if (!res.ok) {
    throw new Error(`Yahoo API 오류: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error('Yahoo 응답 형식 오류');

  const { timestamp, indicators } = result;
  const quote = indicators.quote[0];

  const candles = [];
  for (let i = 0; i < timestamp.length; i++) {
    const ts = timestamp[i];
    const o = quote.open[i];
    const h = quote.high[i];
    const l = quote.low[i];
    const c = quote.close[i];
    const v = quote.volume[i];
    if (o == null || h == null || l == null || c == null || v == null) continue;

    const utc = new Date(ts * 1000).toISOString();
    // NY time: UTC-5(EST) or UTC-4(EDT). 장 마감 16:00 ET = 21:00 UTC
    const kst = new Date(ts * 1000 + 9 * 3600 * 1000).toISOString();

    candles.push({
      symbol,
      timeframe: '1d',
      candle_time_utc: utc,
      candle_time_kst: kst,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
    });
  }

  return candles;
}

async function insertYf(symbol, startDate, endDate) {
  const candles = await fetchYfDaily(symbol, startDate, endDate);
  console.log(`  [YF] ${symbol}: ${candles.length}개 캔들 수집`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < candles.length; i += BATCH) {
    const batch = candles.slice(i, i + BATCH);
    const { error } = await sb
      .from('yf_candles')
      .upsert(batch, { onConflict: 'symbol,candle_time_utc' });
    if (error) throw new Error(`YF 저장 실패: ${error.message}`);
    inserted += batch.length;
  }
  console.log(`  ✅ ${symbol}: ${inserted}개 저장 완료`);
}

// ── KIS (한국투자증권) ────────────────────────────────────────
const KIS_APP_KEY    = process.env.KIS_APP_KEY;
const KIS_APP_SECRET = process.env.KIS_APP_SECRET;
const KIS_ENV        = process.env.KIS_ENV ?? 'PAPER';
const KIS_BASE_URL   = KIS_ENV === 'REAL'
  ? process.env.KIS_REAL_BASE_URL
  : process.env.KIS_PAPER_BASE_URL;

let kisToken = null;
let kisTokenExpiry = 0;

const SYSTEM_GUARD_ID = 1;

async function getKisToken() {
  // 인메모리 캐시 확인
  if (kisToken && Date.now() < kisTokenExpiry - 60000) return kisToken;

  // DB(system_guard)에서 기존 토큰 조회
  const { data: guard, error: guardErr } = await sb
    .from('system_guard')
    .select('kis_token_value,kis_token_expires_at,token_cooldown_until')
    .eq('id', SYSTEM_GUARD_ID)
    .single();

  if (!guardErr && guard) {
    const expiresAt = guard.kis_token_expires_at ? new Date(guard.kis_token_expires_at).getTime() : 0;
    const cooldownUntil = guard.token_cooldown_until ? new Date(guard.token_cooldown_until).getTime() : 0;

    if (Date.now() < cooldownUntil) {
      const remainSec = Math.ceil((cooldownUntil - Date.now()) / 1000);
      throw new Error(`KIS 토큰 쿨다운 중 (${remainSec}초 남음)`);
    }

    if (guard.kis_token_value && expiresAt > Date.now() + 60000) {
      console.log('  [KIS] DB 캐시 토큰 사용');
      kisToken = guard.kis_token_value;
      kisTokenExpiry = expiresAt;
      return kisToken;
    }
  }

  // DB에 유효 토큰 없음 → 새로 발급
  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // 실패 시 쿨다운 기록
    const cooldownUntilIso = new Date(Date.now() + 60000).toISOString();
    await sb.from('system_guard').update({
      token_cooldown_until: cooldownUntilIso,
      updated_at: new Date().toISOString(),
    }).eq('id', SYSTEM_GUARD_ID);
    throw new Error(`KIS 토큰 발급 실패: ${res.status} ${text}`);
  }

  const json = await res.json();
  kisToken = json.access_token;
  const expiresInSec = json.expires_in ?? 86400;
  kisTokenExpiry = Date.now() + expiresInSec * 1000;

  // 발급된 토큰 DB에 저장
  await sb.from('system_guard').update({
    kis_token_value: kisToken,
    kis_token_expires_at: new Date(kisTokenExpiry - 30000).toISOString(),
    token_cooldown_until: null,
    updated_at: new Date().toISOString(),
  }).eq('id', SYSTEM_GUARD_ID);

  console.log('  [KIS] 토큰 발급 완료 (DB 저장)');
  return kisToken;
}

/**
 * KIS 일봉 조회 (최대 100일)
 * FID_INPUT_DATE_1 ~ FID_INPUT_DATE_2 (YYYYMMDD)
 */
async function fetchKisDaily(symbol, startYmd, endYmd) {
  const token = await getKisToken();

  const url = new URL(`${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-price`);
  url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
  url.searchParams.set('FID_INPUT_ISCD', symbol);
  url.searchParams.set('FID_INPUT_DATE_1', startYmd);
  url.searchParams.set('FID_INPUT_DATE_2', endYmd);
  url.searchParams.set('FID_PERIOD_DIV_CODE', 'D');
  url.searchParams.set('FID_ORG_ADJ_PRC', '0');

  const trId = KIS_ENV === 'REAL' ? 'FHKST03010100' : 'FHKST03010100';

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: KIS_APP_KEY,
      appsecret: KIS_APP_SECRET,
      tr_id: trId,
      custtype: 'P',
    },
  });

  if (!res.ok) throw new Error(`KIS 일봉 조회 실패: ${res.status}`);
  const json = await res.json();

  if (json.rt_cd !== '0') {
    throw new Error(`KIS 오류: ${json.msg_cd} - ${json.msg1}`);
  }

  const output = json.output2 ?? json.output ?? [];
  return output;
}

async function insertKis(symbol, startDate, endDate) {
  // KIS는 100일 단위로 페이징
  const start = new Date(startDate);
  const end = new Date(endDate);
  const allCandles = [];

  let cursor = new Date(start);
  while (cursor <= end) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + 99);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());

    const startYmd = cursor.toISOString().slice(0, 10).replace(/-/g, '');
    const endYmd   = chunkEnd.toISOString().slice(0, 10).replace(/-/g, '');

    console.log(`  [KIS] ${symbol} ${startYmd}~${endYmd} 조회 중...`);
    const rows = await fetchKisDaily(symbol, startYmd, endYmd);

    for (const row of rows) {
      // 응답 필드: stck_bsop_date, stck_oprc, stck_hgpr, stck_lwpr, stck_clpr, acml_vol
      const dateStr = row.stck_bsop_date; // YYYYMMDD
      if (!dateStr) continue;
      const year = dateStr.slice(0, 4);
      const month = dateStr.slice(4, 6);
      const day = dateStr.slice(6, 8);
      const utc = new Date(`${year}-${month}-${day}T00:00:00+09:00`).toISOString();
      const kst = `${year}-${month}-${day}T00:00:00+09:00`;

      const o = parseFloat(row.stck_oprc);
      const h = parseFloat(row.stck_hgpr);
      const l = parseFloat(row.stck_lwpr);
      const c = parseFloat(row.stck_clpr);
      const v = parseFloat(row.acml_vol);

      if (!o || !h || !l || !c) continue;

      allCandles.push({
        symbol,
        timeframe: '1d',
        candle_time_utc: utc,
        candle_time_kst: kst,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: v,
      });
    }

    cursor.setDate(cursor.getDate() + 100);
    await new Promise(r => setTimeout(r, 1200)); // KIS rate limit: 초당 1건
  }

  console.log(`  [KIS] ${symbol}: ${allCandles.length}개 캔들 수집`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < allCandles.length; i += BATCH) {
    const batch = allCandles.slice(i, i + BATCH);
    const { error } = await sb
      .from('kis_candles')
      .upsert(batch, { onConflict: 'symbol,candle_time_utc' });
    if (error) throw new Error(`KIS 저장 실패: ${error.message}`);
    inserted += batch.length;
  }
  console.log(`  ✅ ${symbol}: ${inserted}개 저장 완료`);
}

// ── Upbit (업비트 일봉) ───────────────────────────────────────
/**
 * Upbit 일봉 API (공개 API, 인증 불필요)
 * GET https://api.upbit.com/v1/candles/days
 * - market: KRW-BTC 등
 * - count: 최대 200
 * - to: 기준 시각 (yyyy-MM-dd HH:mm:ss, 해당 시각 이전 캔들 반환)
 */
async function fetchUpbitDailyBatch(market, toIso) {
  const to = toIso
    ? new Date(toIso).toISOString().replace('T', ' ').slice(0, 19)
    : undefined;

  const url = new URL('https://api.upbit.com/v1/candles/days');
  url.searchParams.set('market', market);
  url.searchParams.set('count', '200');
  if (to) url.searchParams.set('to', to);

  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Upbit API 오류: ${res.status} ${await res.text()}`);
  }

  return await res.json();
}

function toKstTimestamp(utcIso) {
  // UTC ISO → KST 로컬 문자열 (yyyy-MM-dd HH:mm:ss)
  const d = new Date(utcIso + 'Z');
  const kstMs = d.getTime() + 9 * 3600 * 1000;
  const kst = new Date(kstMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ` +
    `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}:${pad(kst.getUTCSeconds())}`;
}

async function insertUpbit(market, startDate, endDate) {
  const startMs = new Date(startDate).getTime();
  const endMs   = new Date(endDate + 'T23:59:59Z').getTime();

  const allCandles = [];
  let cursor = null; // null = 현재 시각부터

  while (true) {
    const batch = await fetchUpbitDailyBatch(market, cursor);
    if (!Array.isArray(batch) || batch.length === 0) break;

    let hitStart = false;
    for (const c of batch) {
      const utcIso = c.candle_date_time_utc; // "2020-01-02T00:00:00"
      const candleMs = new Date(utcIso + 'Z').getTime();

      if (candleMs > endMs) continue; // 종료 이후 캔들 스킵
      if (candleMs < startMs) { hitStart = true; break; } // 시작일 이전 도달

      allCandles.push({
        market: c.market,
        timeframe: '1d',
        candle_time_utc: utcIso + '.000Z',
        candle_time_kst: toKstTimestamp(utcIso),
        open: c.opening_price,
        high: c.high_price,
        low: c.low_price,
        close: c.trade_price,
        volume: c.candle_acc_trade_volume,
        trade_price: c.candle_acc_trade_price,
        source_timestamp: c.timestamp,
      });
    }

    if (hitStart) break;

    // 다음 페이지: 배치 중 가장 오래된 캔들 시각 이전으로 이동
    const oldest = batch[batch.length - 1];
    const oldestMs = new Date(oldest.candle_date_time_utc + 'Z').getTime();
    if (oldestMs <= startMs) break;

    cursor = oldest.candle_date_time_utc + 'Z'; // to = 이 시각 이전
    await new Promise(r => setTimeout(r, 120)); // Rate limit 여유
  }

  console.log(`  [Upbit] ${market}: ${allCandles.length}개 캔들 수집`);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < allCandles.length; i += BATCH) {
    const batch = allCandles.slice(i, i + BATCH);
    const { error } = await sb
      .from('upbit_candles')
      .upsert(batch, { onConflict: 'market,timeframe,candle_time_utc' });
    if (error) throw new Error(`Upbit 저장 실패: ${error.message}`);
    inserted += batch.length;
    console.log(`  [Upbit] ${market}: ${inserted}/${allCandles.length}개 저장 중...`);
  }
  console.log(`  ✅ ${market}: ${inserted}개 저장 완료`);
}

// ── Main ──────────────────────────────────────────────────────
const [,, market, ...symbols] = process.argv;
const START_DATE = process.env.START_DATE ?? '2022-01-01';
const END_DATE   = process.env.END_DATE   ?? new Date().toISOString().slice(0, 10);

if (!market || symbols.length === 0) {
  console.log('사용법: node scripts/fetch-historical-candles.mjs <yf|kis|upbit> <심볼...>');
  console.log('예시:');
  console.log('  node scripts/fetch-historical-candles.mjs yf AAPL NVDA');
  console.log('  node scripts/fetch-historical-candles.mjs kis 005930 000660');
  console.log('  node scripts/fetch-historical-candles.mjs upbit KRW-BTC KRW-ETH');
  process.exit(0);
}

console.log(`\n📥 ${market.toUpperCase()} 일봉 수집: ${symbols.join(', ')}`);
console.log(`   기간: ${START_DATE} ~ ${END_DATE}\n`);

try {
  for (const symbol of symbols) {
    if (market === 'yf') {
      await insertYf(symbol, START_DATE, END_DATE);
    } else if (market === 'kis') {
      await insertKis(symbol, START_DATE, END_DATE);
    } else if (market === 'upbit') {
      await insertUpbit(symbol, START_DATE, END_DATE);
    } else {
      console.error('market은 yf, kis, upbit 중 선택');
      process.exit(1);
    }
  }
  console.log('\n🎉 모든 수집 완료!');
} catch (e) {
  console.error('❌ 오류:', e.message);
  process.exit(1);
}
