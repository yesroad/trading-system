import Big from 'big.js';
import { DateTime } from 'luxon';
import { getSupabase, insertTradingSignal } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';
import { loadCandles } from '../data/loader.js';
import { EnhancedMAStrategy } from '../strategies/enhanced-ma-strategy.js';
import { BBSqueezeStrategy } from '../strategies/bb-squeeze-strategy.js';
import { RegimeAdaptiveStrategy } from '../strategies/regime-adaptive-strategy.js';
import { SimpleMAStrategy } from '../strategies/simple-ma-crossover.js';
import { resolveSymbol } from '../engine/portfolio-walk-forward.js';
import type { Candle, Position, Strategy } from '../types.js';

const logger = createLogger('portfolio-signal');

export interface PortfolioSignalOptions {
  symbols: string[];
  lookbackDays: number;        // 워밍업 포함 로드 기간 (기본: 300)
  usStrategy: string;          // 미장(yf) 전략 (기본: enhanced-ma)
  cryptoStrategy: string;      // 코인(upbit) 전략 (기본: bb-squeeze)
  krxStrategy: string;         // 국장(kis) 전략 (기본: bb-squeeze)
  useSPYFilter: boolean;       // SPY IS MA200 레짐 필터
  symbolMaFilter: boolean;     // 심볼별 MA50 필터
  symbolMaPeriod: number;      // 심볼별 MA 기간 (기본: 50)
  // 전략 공통 파라미터
  shortMa: number;
  longMa: number;
  atrMultiplier: number;
  slopePeriod: number;
  ma200Period: number;
  bbPeriod: number;
  bbStdDev: number;
  keltnerMultiplier: number;
  dryRun: boolean;
}

interface SymbolSignalResult {
  symbol: string;
  market: 'CRYPTO' | 'KRX' | 'US';
  strategyName: string;
  action: 'BUY' | 'SELL' | 'HOLD';
  reason: string;
  currentPrice: Big;
  entry: Big | null;
  stopLoss: Big | null;
  target: Big | null;
  stopLossPct: string;
  blocked: boolean;
  blockedReason: string;
  latestDate: string;
}

/**
 * 포트폴리오 단위 실전 신호 생성
 *
 * 1. SPY MA200 레짐 필터 (--spy-filter)
 * 2. 심볼별 MA 필터 (--symbol-ma-filter)
 * 3. 시장별 전략 적용 (--us-strategy / --crypto-strategy / --krx-strategy)
 * 4. 신호 콘솔 출력 + trading_signals INSERT (dry-run 아닌 경우)
 */
export async function runPortfolioSignal(options: PortfolioSignalOptions): Promise<void> {
  const today = DateTime.now().toISODate() ?? '';
  const endDate = DateTime.now().toISO()!;
  const startDate = DateTime.now().minus({ days: options.lookbackDays }).toISO()!;

  console.log('\n' + '='.repeat(60));
  console.log('포트폴리오 실전 신호 생성');
  console.log('='.repeat(60));
  console.log(`심볼: ${options.symbols.join(', ')}`);
  console.log(`기준일: ${today}`);
  console.log(`로드 기간: 최근 ${options.lookbackDays}일`);
  console.log(`SPY 레짐 필터: ${options.useSPYFilter ? 'ON' : 'OFF'}`);
  if (options.symbolMaFilter) console.log(`심볼 MA 필터: MA${options.symbolMaPeriod}`);
  const allSame = options.usStrategy === options.cryptoStrategy &&
    options.cryptoStrategy === options.krxStrategy;
  if (allSame) {
    console.log(`전략: ${options.usStrategy} (전체 공통)`);
  } else {
    console.log(`전략: 미장=${options.usStrategy} | 코인=${options.cryptoStrategy} | 국장=${options.krxStrategy}`);
  }
  if (options.dryRun) console.log('모드: DRY-RUN (DB 저장 없음)');
  console.log('='.repeat(60) + '\n');

  // ── 1. SPY MA200 레짐 체크 ─────────────────────────────────────
  let spyBlocked = false;
  if (options.useSPYFilter) {
    spyBlocked = await checkSPYFilter(startDate, endDate, options.ma200Period);
    if (spyBlocked) {
      console.log('🔒 SPY MA200 레짐: 하락 추세 감지 → 신규 Long 금지\n');
    } else {
      console.log('✅ SPY MA200 레짐: 상승 추세 확인\n');
    }
  }

  // ── 2. 심볼별 신호 생성 ────────────────────────────────────────
  const results: SymbolSignalResult[] = [];

  for (const raw of options.symbols) {
    const { symbol, source } = resolveSymbol(raw);
    const market = sourceToMarket(source);
    const broker = sourceToBroker(source);
    const stratName =
      source === 'upbit' ? options.cryptoStrategy :
      source === 'kis'   ? options.krxStrategy :
      options.usStrategy;

    console.log(`📊 [${symbol}] (${market}) — ${stratName}`);

    // 캔들 로드
    const candles = await loadCandles({ symbol, startDate, endDate, source });
    if (candles.length < 30) {
      console.log(`   ⚠️  캔들 부족: ${candles.length}개\n`);
      results.push(makeBlockedResult(symbol, market, stratName, '캔들 부족', new Big(0), today));
      continue;
    }

    const latestCandle = candles[candles.length - 1]!;
    const currentPrice = latestCandle.close;
    const latestDate = latestCandle.candleTime.slice(0, 10);
    console.log(`   캔들: ${candles.length}개 | 최근: ${latestDate} | 종가: ${currentPrice.toFixed(2)}`);

    // SPY 레짐 차단 (코인/국장은 레짐 무관)
    if (spyBlocked && source === 'yf') {
      console.log('   🔒 SPY 레짐 차단 → HOLD\n');
      results.push(makeBlockedResult(symbol, market, stratName, 'SPY MA200 하락', currentPrice, latestDate));
      continue;
    }

    // 심볼 MA 필터
    if (options.symbolMaFilter) {
      const maPeriod = options.symbolMaPeriod;
      if (candles.length >= maPeriod) {
        const recentN = candles.slice(-maPeriod);
        const ma = recentN.reduce((s, c) => s.plus(c.close), new Big(0)).div(maPeriod);
        if (currentPrice.lt(ma)) {
          console.log(`   🔻 MA${maPeriod} 필터: 종가 ${currentPrice.toFixed(2)} < MA${maPeriod} ${ma.toFixed(2)} → HOLD\n`);
          results.push(makeBlockedResult(symbol, market, stratName, `MA${maPeriod} 하락 추세`, currentPrice, latestDate));
          continue;
        } else {
          console.log(`   ✅ MA${maPeriod}: ${currentPrice.toFixed(2)} > ${ma.toFixed(2)}`);
        }
      }
    }

    // 현재 포지션 조회
    const position = await getCurrentPosition(symbol, broker);
    if (position) {
      console.log(`   포지션: ${position.qty.toFixed(4)} @ ${position.avgPrice.toFixed(2)}`);
    } else {
      console.log(`   포지션: 없음`);
    }

    // 전략 생성 및 신호 생성
    const strat = buildStrategy(stratName, options);
    const signal = strat.generateSignal(candles, position);
    console.log(`   신호: ${signal.action}${signal.reason ? ` — ${signal.reason}` : ''}`);

    if (signal.action === 'HOLD') {
      console.log('');
      results.push({
        symbol, market, strategyName: strat.name, action: 'HOLD',
        reason: signal.reason ?? 'HOLD',
        currentPrice, entry: null, stopLoss: null, target: null,
        stopLossPct: '-', blocked: false, blockedReason: '', latestDate,
      });
      continue;
    }

    // 진입가 / 손절 / 목표 계산
    const atr = calculateATR(candles, 14);
    const entry = currentPrice;
    const stopLoss =
      signal.action === 'BUY'
        ? entry.minus(atr.times(options.atrMultiplier))
        : entry.plus(atr.times(options.atrMultiplier));
    const stopDist = entry.minus(stopLoss).abs();
    const target =
      signal.action === 'BUY'
        ? entry.plus(stopDist.times(2))
        : entry.minus(stopDist.times(2));
    const stopLossPct = stopDist.div(entry).times(100).toFixed(2) + '%';

    console.log(`   진입가:  ${entry.toFixed(2)}`);
    console.log(`   손절가:  ${stopLoss.toFixed(2)} (-${stopLossPct})`);
    console.log(`   목표가:  ${target.toFixed(2)} (R/R 2.0)\n`);

    results.push({
      symbol, market, strategyName: strat.name,
      action: signal.action as 'BUY' | 'SELL',
      reason: signal.reason ?? signal.action,
      currentPrice, entry, stopLoss, target, stopLossPct,
      blocked: false, blockedReason: '', latestDate,
    });

    // trading_signals INSERT
    if (!options.dryRun && (signal.action === 'BUY' || signal.action === 'SELL')) {
      try {
        const signalId = await insertTradingSignal({
          symbol,
          market,
          broker,
          signal_type: signal.action as 'BUY' | 'SELL',
          entry_price: entry.toString(),
          target_price: target.toString(),
          stop_loss: stopLoss.toString(),
          confidence: 0.75,
          reason: `${strat.name}: ${signal.action} | ${signal.reason ?? ''} | ATR: ${atr.toFixed(2)} | 손절: ${stopLossPct}`,
          indicators: {
            strategy: strat.name,
            atr: atr.toFixed(2),
            candleDate: latestDate,
            stopLossPct,
          },
          ai_analysis_id: undefined,
        });
        logger.info('신호 저장 완료', { signalId, symbol, action: signal.action });
        console.log(`   ✅ DB 저장 완료 (ID: ${signalId})\n`);
      } catch (err) {
        logger.error('신호 저장 실패', { err, symbol });
        console.log(`   ❌ DB 저장 실패: ${err}\n`);
      }
    }
  }

  // ── 3. 요약 ───────────────────────────────────────────────────
  printSummary(results, options.dryRun);
}

// ── 헬퍼: SPY MA200 필터 ────────────────────────────────────────

async function checkSPYFilter(
  startDate: string,
  endDate: string,
  ma200Period: number,
): Promise<boolean> {
  const extStart = DateTime.fromISO(startDate).minus({ days: 50 }).toISO()!;
  try {
    const candles = await loadCandles({ symbol: 'SPY', startDate: extStart, endDate, source: 'yf' });
    if (candles.length < ma200Period) return false;
    const recent = candles.slice(-ma200Period);
    const ma200 = recent.reduce((s, c) => s.plus(c.close), new Big(0)).div(ma200Period);
    const lastClose = candles[candles.length - 1]!.close;
    return lastClose.lt(ma200); // true = 하락 추세 → 차단
  } catch {
    return false;
  }
}

// ── 헬퍼: 전략 빌드 ───────────────────────────────────────────

function buildStrategy(name: string, opts: PortfolioSignalOptions): Strategy {
  switch (name) {
    case 'enhanced-ma':
      return new EnhancedMAStrategy({
        shortPeriod: opts.shortMa,
        longPeriod: opts.longMa,
        atrMultiplier: opts.atrMultiplier,
        slopePeriod: opts.slopePeriod,
        ma200Period: opts.ma200Period,
      });
    case 'bb-squeeze':
      return new BBSqueezeStrategy({
        bbPeriod: opts.bbPeriod,
        bbStdDev: opts.bbStdDev,
        keltnerMultiplier: opts.keltnerMultiplier,
        atrStopMultiplier: opts.atrMultiplier,
      });
    case 'simple-ma':
      return new SimpleMAStrategy({ shortPeriod: opts.shortMa, longPeriod: opts.longMa });
    case 'regime-adaptive':
    default:
      return new RegimeAdaptiveStrategy({
        sma50Period: 50,
        sma200Period: opts.ma200Period,
        adxPeriod: 14,
        enhancedMa: {
          shortPeriod: opts.shortMa,
          longPeriod: opts.longMa,
          atrMultiplier: opts.atrMultiplier,
          slopePeriod: opts.slopePeriod,
          ma200Period: opts.ma200Period,
        },
        bbSqueeze: {
          bbPeriod: opts.bbPeriod,
          bbStdDev: opts.bbStdDev,
          keltnerMultiplier: opts.keltnerMultiplier,
          atrStopMultiplier: opts.atrMultiplier,
        },
      });
  }
}

// ── 헬퍼: 포지션 조회 ─────────────────────────────────────────

async function getCurrentPosition(symbol: string, broker: string): Promise<Position | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('positions')
    .select('qty, avg_price')
    .eq('symbol', symbol)
    .eq('broker', broker)
    .gt('qty', 0)
    .maybeSingle();

  if (error || !data) return null;

  const qty = new Big(String(data.qty));
  const avgPrice = new Big(String(data.avg_price));
  return { symbol, qty, avgPrice, unrealizedPnL: new Big(0), entryTime: '' };
}

// ── 헬퍼: ATR 계산 ────────────────────────────────────────────

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

// ── 헬퍼: 소스/마켓/브로커 변환 ──────────────────────────────

function sourceToMarket(source: 'upbit' | 'kis' | 'yf'): 'CRYPTO' | 'KRX' | 'US' {
  if (source === 'upbit') return 'CRYPTO';
  if (source === 'kis') return 'KRX';
  return 'US';
}

function sourceToBroker(source: 'upbit' | 'kis' | 'yf'): 'UPBIT' | 'KIS' {
  return source === 'upbit' ? 'UPBIT' : 'KIS';
}

function makeBlockedResult(
  symbol: string,
  market: 'CRYPTO' | 'KRX' | 'US',
  strategyName: string,
  blockedReason: string,
  currentPrice: Big,
  latestDate: string,
): SymbolSignalResult {
  return {
    symbol, market, strategyName, action: 'HOLD',
    reason: blockedReason, currentPrice,
    entry: null, stopLoss: null, target: null,
    stopLossPct: '-', blocked: true, blockedReason, latestDate,
  };
}

// ── 요약 출력 ─────────────────────────────────────────────────

function printSummary(results: SymbolSignalResult[], dryRun: boolean): void {
  console.log('='.repeat(60));
  console.log('📋 신호 요약');
  console.log('='.repeat(60));

  const buySignals  = results.filter((r) => r.action === 'BUY');
  const sellSignals = results.filter((r) => r.action === 'SELL');
  const holdSignals = results.filter((r) => r.action === 'HOLD' && !r.blocked);
  const blocked     = results.filter((r) => r.blocked);

  console.log(`BUY  : ${buySignals.length}개  | SELL: ${sellSignals.length}개  | HOLD: ${holdSignals.length}개  | 차단: ${blocked.length}개\n`);

  if (buySignals.length > 0) {
    console.log('🟢 BUY 신호:');
    for (const r of buySignals) {
      console.log(`  ${r.symbol.padEnd(10)} ${r.currentPrice.toFixed(2).padStart(12)}  손절 -${r.stopLossPct}  목표 +${r.stopLossPct.replace('-', '')}×2`);
      console.log(`             전략: ${r.strategyName} | ${r.reason}`);
    }
    console.log('');
  }

  if (sellSignals.length > 0) {
    console.log('🔴 SELL 신호:');
    for (const r of sellSignals) {
      console.log(`  ${r.symbol.padEnd(10)} ${r.currentPrice.toFixed(2).padStart(12)}  | ${r.reason}`);
    }
    console.log('');
  }

  if (blocked.length > 0) {
    console.log('🔒 차단 (레짐/MA 필터):');
    for (const r of blocked) {
      console.log(`  ${r.symbol.padEnd(10)} ${r.blockedReason}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('💡 DRY-RUN 모드: 실제 DB 저장 없음. --no-dry-run 플래그로 저장 활성화');
  }
}
