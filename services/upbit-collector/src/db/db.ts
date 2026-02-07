import { supabase } from './supabase';
import type { UpbitMinuteCandle } from '../types/upbit';
import { nowIso, normalizeUtcIso } from '@workspace/shared-utils';

// UTC ISO → KST 로컬 시각 문자열(YYYY-MM-DD HH:mm:ss)
function utcIsoToKstLocalTimestamp(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`시간 파싱 실패(UTC): ${utcIso}`);
  }

  return d.toLocaleString('sv-SE', {
    timeZone: 'Asia/Seoul',
    hour12: false,
  });
}

export async function upsertUpbitCandles(rows: UpbitMinuteCandle[]): Promise<number> {
  if (rows.length === 0) return 0;

  const payload = rows.map((c) => {
    const candleTimeUtc = normalizeUtcIso(c.candle_date_time_utc);
    const candleTimeKst = utcIsoToKstLocalTimestamp(candleTimeUtc);

    return {
      market: c.market,
      timeframe: `${c.unit}m`,
      candle_time_kst: candleTimeKst,
      candle_time_utc: candleTimeUtc,
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

  const { error, data } = await supabase
    .from('upbit_candles')
    .upsert(payload, { onConflict: 'market,timeframe,candle_time_utc' })
    .select('market');

  if (error) throw new Error(`upbit_candles 저장 실패: ${error.message}`);

  return Array.isArray(data) ? data.length : rows.length;
}
