import Big from 'big.js';
import { DateTime } from 'luxon';
import { getSupabase, insertTradingSignal } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import { loadCandles } from '../data/loader.js';
import { EnhancedMAStrategy } from '../strategies/enhanced-ma-strategy.js';
import { SimpleMAStrategy } from '../strategies/simple-ma-crossover.js';
import { BBSqueezeStrategy } from '../strategies/bb-squeeze-strategy.js';
import type { Candle, Position } from '../types.js';

const logger = createLogger('live-signal');

export interface LiveSignalOptions {
  symbol: string;
  lookbackDays: number;
  strategy: string;
  shortMa: number;
  longMa: number;
  atrMultiplier: number;
  slopePeriod: number;
  use200MaFilter: boolean;
  ma200Period: number;
  useAdxFilter: boolean;
  adxThreshold: number;
  bbPeriod: number;
  bbStdDev: number;
  keltnerMultiplier: number;
  dryRun: boolean;
}

/**
 * 실시간 Enhanced MA 신호 생성
 *
 * 1. DB에서 최근 캔들 로드 (lookbackDays일치)
 * 2. positions 테이블에서 현재 포지션 조회
 * 3. Enhanced MA 전략 신호 생성
 * 4. BUY/SELL 신호 발생 시 trading_signals 테이블 INSERT
 */
export async function runLiveSignal(options: LiveSignalOptions): Promise<void> {
  const {
    symbol,
    lookbackDays,
    strategy,
    shortMa,
    longMa,
    atrMultiplier,
    slopePeriod,
    use200MaFilter,
    ma200Period,
    useAdxFilter,
    adxThreshold,
    bbPeriod,
    bbStdDev,
    keltnerMultiplier,
    dryRun,
  } = options;

  const source = determineSource(symbol);
  const market = determineMarket(symbol);
  const broker = determineBroker(symbol);

  // ── 1. 캔들 데이터 로드 ─────────────────────────────────────────
  const endDate = DateTime.now().toISO()!;
  const startDate = DateTime.now().minus({ days: lookbackDays }).toISO()!;

  logger.info('캔들 데이터 로드 중', { symbol, lookbackDays, source });
  const candles = await loadCandles({ symbol, startDate, endDate, source });

  const minRequired = Math.max(longMa + slopePeriod, 14 + 1) + 5;
  if (candles.length < minRequired) {
    console.log(`❌ 캔들 데이터 부족: ${candles.length}개 (최소 ${minRequired}개 필요)`);
    return;
  }

  const latestCandle = candles[candles.length - 1]!;
  console.log(`\n📊 ${symbol} 신호 분석`);
  console.log(
    `   캔들: ${candles.length}개 | 최근: ${latestCandle.candleTime.slice(0, 10)} | 종가: ${latestCandle.close.toFixed(0)}`
  );

  // ── 2. 현재 포지션 조회 ─────────────────────────────────────────
  const position = await getCurrentPosition(symbol, broker);

  if (position) {
    console.log(
      `   포지션: ${position.qty.toFixed(4)}주 @ ${position.avgPrice.toFixed(0)} (미실현 P&L: ${position.unrealizedPnL.toFixed(0)})`
    );
  } else {
    console.log(`   포지션: 없음`);
  }

  // ── 3. 전략 신호 생성 ──────────────────────────────────────────
  let strat;
  if (strategy === 'enhanced-ma') {
    strat = new EnhancedMAStrategy({
      shortPeriod: shortMa,
      longPeriod: longMa,
      atrMultiplier,
      slopePeriod,
      use200MaFilter,
      ma200Period,
      useAdxFilter,
      adxThreshold,
    });
  } else if (strategy === 'bb-squeeze') {
    strat = new BBSqueezeStrategy({
      bbPeriod,
      bbStdDev,
      keltnerMultiplier,
      atrStopMultiplier: atrMultiplier,
    });
  } else {
    strat = new SimpleMAStrategy({ shortPeriod: shortMa, longPeriod: longMa });
  }

  const signal = strat.generateSignal(candles, position);

  console.log(
    `\n   신호: ${signal.action}${signal.reason ? `\n   근거: ${signal.reason}` : ''}`
  );

  if (signal.action === 'HOLD') {
    console.log('\n⏸️  신호 없음 (HOLD) — trading_signals 저장 건너뜀');
    return;
  }

  // ── 4. 진입가 / 손절가 / 목표가 계산 ─────────────────────────
  const entry = latestCandle.close;
  const atr = calculateATR(candles, 14);
  const stopLoss =
    signal.action === 'BUY'
      ? entry.minus(atr.times(atrMultiplier))
      : entry.plus(atr.times(atrMultiplier));
  const stopDist = entry.minus(stopLoss).abs();
  const target =
    signal.action === 'BUY' ? entry.plus(stopDist.times(2)) : entry.minus(stopDist.times(2));

  const stopLossPct = stopDist.div(entry).times(100);
  const confidence = 0.75; // 규칙 기반 신호 고정 신뢰도

  const indicators: Record<string, unknown> = {
    strategy: strat.name,
    shortMa,
    longMa,
    atrMultiplier,
    slopePeriod,
    atr: atr.toFixed(0),
    currentPrice: entry.toFixed(0),
    stopLossPct: `${stopLossPct.toFixed(2)}%`,
    rr: '2.0',
    candleDate: latestCandle.candleTime.slice(0, 10),
  };

  const reason = [
    `${strat.name}: ${signal.action}`,
    signal.reason ?? '',
    `캔들 기준일: ${latestCandle.candleTime.slice(0, 10)}`,
    `ATR: ${atr.toFixed(0)}, 손절: ${stopLossPct.toFixed(2)}%`,
  ]
    .filter(Boolean)
    .join(' | ');

  console.log(`\n   진입가:  ${entry.toFixed(0)}`);
  console.log(`   손절가:  ${stopLoss.toFixed(0)} (ATR×${atrMultiplier}, -${stopLossPct.toFixed(2)}%)`);
  console.log(`   목표가:  ${target.toFixed(0)} (R/R 2.0)`);
  console.log(`   신뢰도:  ${(confidence * 100).toFixed(0)}%`);

  // ── 5. trading_signals INSERT ──────────────────────────────────
  if (dryRun) {
    console.log('\n🔍 DRY-RUN 모드: DB 저장 건너뜀 (--no-dry-run 으로 실제 저장)');
    return;
  }

  const signalId = await insertTradingSignal({
    symbol,
    market,
    broker,
    signal_type: signal.action as 'BUY' | 'SELL',
    entry_price: entry.toString(),
    target_price: target.toString(),
    stop_loss: stopLoss.toString(),
    confidence,
    reason,
    indicators,
    ai_analysis_id: undefined,
  });

  logger.info('신호 저장 완료', { signalId, symbol, action: signal.action });
  console.log(`\n✅ 신호 저장 완료 (ID: ${signalId})`);
  console.log(`   → trade-executor가 다음 루프에서 처리합니다.`);
}

// ── 헬퍼 함수 ──────────────────────────────────────────────────────

async function getCurrentPosition(symbol: string, broker: string): Promise<Position | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('positions')
    .select('qty, avg_price')
    .eq('symbol', symbol)
    .eq('broker', broker)
    .gt('qty', 0)
    .maybeSingle();

  if (error) {
    logger.warn('포지션 조회 실패', { error, symbol, broker });
    return null;
  }
  if (!data) return null;

  const qty = new Big(String(data.qty));
  const avgPrice = new Big(String(data.avg_price));
  return {
    symbol,
    qty,
    avgPrice,
    unrealizedPnL: new Big(0), // 실시간 계산 불필요 (신호 생성 용도)
    entryTime: '',
  };
}

function calculateATR(candles: Candle[], period: number): Big {
  if (candles.length < period + 1) {
    const recent = candles.slice(-period);
    const sum = recent.reduce((acc, c) => acc.plus(c.high.minus(c.low)), new Big(0));
    return sum.div(recent.length);
  }
  const recent = candles.slice(-(period + 1));
  let trSum = new Big(0);
  for (let i = 1; i < recent.length; i++) {
    const cur = recent[i]!;
    const prev = recent[i - 1]!;
    const hl = cur.high.minus(cur.low);
    const hc = cur.high.minus(prev.close).abs();
    const lc = cur.low.minus(prev.close).abs();
    const tr = hl.gt(hc) ? (hl.gt(lc) ? hl : lc) : hc.gt(lc) ? hc : lc;
    trSum = trSum.plus(tr);
  }
  return trSum.div(period);
}

function determineSource(symbol: string): 'upbit' | 'kis' | 'yf' {
  if (symbol.startsWith('KRW-')) return 'upbit';
  if (/^\d{6}$/.test(symbol)) return 'kis';
  return 'yf';
}

function determineMarket(symbol: string): 'CRYPTO' | 'KRX' | 'US' {
  if (symbol.startsWith('KRW-')) return 'CRYPTO';
  if (/^\d{6}$/.test(symbol)) return 'KRX';
  return 'US';
}

function determineBroker(symbol: string): 'UPBIT' | 'KIS' {
  return symbol.startsWith('KRW-') ? 'UPBIT' : 'KIS';
}
