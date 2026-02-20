import { createLogger } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import Big from 'big.js';
import { getSupabase } from '@workspace/db-client';
import { runWalkForward } from './walk-forward.js';
import { loadCandles } from '../data/loader.js';
import type {
  Strategy,
  BacktestConfig,
  WalkForwardConfig,
  WalkForwardWindowResult,
} from '../types.js';
import { SLIPPAGE_PRESETS } from '../models/slippage.js';

const logger = createLogger('portfolio-wf');

// ============================================================
// 타입 정의
// ============================================================

export interface SymbolConfig {
  symbol: string;
  source: 'upbit' | 'kis' | 'yf';
}

export interface PortfolioWindowResult {
  windowIndex: number;
  inSampleStart: string;
  inSampleEnd: string;
  outSampleStart: string;
  outSampleEnd: string;
  /** 창별 각 심볼 OOS 수익률 (valid 창만) */
  symbolReturns: Record<string, number | null>;
  /** 포트폴리오 OOS 수익률 (동일비중, 최대 N종목) */
  portfolioReturn: number;
  /** 활성 종목 목록 (이번 OOS에서 포지션 보유) */
  activeSymbols: string[];
  /** SPY 레짐 필터 적용 여부 */
  spyFilterApplied: boolean;
  /** OOS 거래 수 (포트폴리오 합계) */
  totalOosTrades: number;
  /** 포지션 스케일 (1.0=정상, 0.5=DD감속, 0=DD현금) */
  positionScalar: number;
  /** 적용 시점 누적 DD (%) */
  ddAtWindow: number;
  /** 상태 */
  status: 'valid' | 'insufficient_trades' | 'spy_blocked' | 'dd_halted' | 'dd_reduced';
}

export interface PortfolioWalkForwardResult {
  symbols: string[];
  startDate: string;
  endDate: string;
  wfConfig: WalkForwardConfig;
  windows: PortfolioWindowResult[];
  /** 포트폴리오 집계 지표 */
  aggregated: {
    medianOosReturn: number;
    avgOosReturn: number;
    positiveWindowCount: number;
    totalValidWindows: number;
    positiveRatio: number;
    maxDrawdown: number;
    sharpeEstimate: number;
    oosConsistencyPass: boolean;
  };
  /** 심볼별 평균 OOS 수익률 기여도 */
  symbolContributions: Array<{ symbol: string; avgReturn: number; validWindows: number }>;
  /** 사용된 전략 이름 */
  strategyName: string;
}

// ============================================================
// 심볼 설정 헬퍼
// ============================================================

/** BTC/ETH 별칭 처리 + 소스 결정 */
export function resolveSymbol(raw: string): SymbolConfig {
  const s = raw.trim().toUpperCase();
  // 단축 코인명 → Upbit 형식으로 변환
  if (s === 'BTC') return { symbol: 'KRW-BTC', source: 'upbit' };
  if (s === 'ETH') return { symbol: 'KRW-ETH', source: 'upbit' };
  if (s.startsWith('KRW-')) return { symbol: s, source: 'upbit' };
  if (/^\d{6}$/.test(s)) return { symbol: s, source: 'kis' };
  return { symbol: s, source: 'yf' };
}

// ============================================================
// 데이터 사전 체크
// ============================================================

export interface DataAvailabilityResult {
  symbol: string;
  source: 'upbit' | 'kis' | 'yf';
  available: boolean;        // true = 데이터 충분
  candleCount: number;
  earliestDate: string | null;
  latestDate: string | null;
  requiredStart: string;     // 워밍업 포함 최소 시작일
  requiredEnd: string;
  minRequired: number;       // 최소 필요 캔들 수
  warning: string | null;
}

/**
 * 실행 전 각 심볼의 DB 데이터 존재 여부 강제 체크
 *
 * @param symbolRaws - 원본 심볼 목록
 * @param startDate - WF 시작일
 * @param endDate - WF 종료일
 * @param warmupDays - 워밍업 기간
 * @param inSampleDays - IS 기간
 * @param outSampleDays - OOS 기간
 * @returns 심볼별 가용성 결과 배열
 */
export async function checkDataAvailability(params: {
  symbolRaws: string[];
  startDate: string;
  endDate: string;
  warmupDays: number;
  inSampleDays: number;
  outSampleDays: number;
}): Promise<DataAvailabilityResult[]> {
  const { symbolRaws, startDate, endDate, warmupDays, inSampleDays, outSampleDays } = params;

  // 워밍업 포함 최소 시작일
  const requiredStart = DateTime.fromISO(startDate)
    .minus({ days: warmupDays })
    .toISODate() ?? startDate;
  const requiredEnd = endDate;

  // 최소 필요 캔들 수: (IS + OOS + warmup) × 0.6 (거래일 비율 근사)
  const minRequired = Math.floor((inSampleDays + outSampleDays + warmupDays) * 0.6);

  const supabase = getSupabase();
  const results: DataAvailabilityResult[] = [];

  for (const raw of symbolRaws) {
    const { symbol, source } = resolveSymbol(raw);
    const tableName = `${source}_candles`;
    const symbolCol = source === 'upbit' ? 'market' : 'symbol';
    const timeCol = 'candle_time_utc';

    try {
      // 기간 내 캔들 수 + 최초/최근 날짜 조회
      const { count, error: countErr } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq(symbolCol, symbol)
        .gte(timeCol, requiredStart)
        .lte(timeCol, requiredEnd);

      if (countErr) {
        results.push({
          symbol, source, available: false,
          candleCount: 0, earliestDate: null, latestDate: null,
          requiredStart, requiredEnd, minRequired,
          warning: `DB 조회 오류: ${countErr.message}`,
        });
        continue;
      }

      const candleCount = count ?? 0;

      // 최초/최근 날짜 별도 조회 (데이터가 있을 때만)
      let earliestDate: string | null = null;
      let latestDate: string | null = null;

      if (candleCount > 0) {
        const { data: earliest } = await supabase
          .from(tableName)
          .select(timeCol)
          .eq(symbolCol, symbol)
          .order(timeCol, { ascending: true })
          .limit(1)
          .single();

        const { data: latest } = await supabase
          .from(tableName)
          .select(timeCol)
          .eq(symbolCol, symbol)
          .order(timeCol, { ascending: false })
          .limit(1)
          .single();

        earliestDate = earliest ? (earliest as Record<string, string>)[timeCol]?.slice(0, 10) ?? null : null;
        latestDate = latest ? (latest as Record<string, string>)[timeCol]?.slice(0, 10) ?? null : null;
      }

      const available = candleCount >= minRequired;
      const warning = !available
        ? candleCount === 0
          ? `DB에 데이터 없음 (${tableName}.${symbolCol}='${symbol}')`
          : `캔들 ${candleCount}개 < 최소 ${minRequired}개 (${earliestDate} ~ ${latestDate})`
        : null;

      results.push({
        symbol, source, available, candleCount,
        earliestDate, latestDate,
        requiredStart, requiredEnd, minRequired, warning,
      });
    } catch (err) {
      results.push({
        symbol, source, available: false,
        candleCount: 0, earliestDate: null, latestDate: null,
        requiredStart, requiredEnd, minRequired,
        warning: `예외 발생: ${String(err)}`,
      });
    }
  }

  return results;
}

/**
 * 데이터 가용성 결과를 콘솔에 출력
 */
function printDataAvailability(results: DataAvailabilityResult[]): void {
  const ok = results.filter((r) => r.available);
  const ng = results.filter((r) => !r.available);

  console.log('\n' + '='.repeat(60));
  console.log('데이터 사전 체크 결과');
  console.log('='.repeat(60));
  console.log(`필요 기간: ${results[0]?.requiredStart ?? '-'} ~ ${results[0]?.requiredEnd ?? '-'}`);
  console.log(`최소 캔들 수: ${results[0]?.minRequired ?? '-'}개`);
  console.log('');

  for (const r of results) {
    const icon = r.available ? '✅' : '❌';
    const countStr = r.candleCount > 0
      ? `${r.candleCount}캔들 (${r.earliestDate} ~ ${r.latestDate})`
      : '데이터 없음';
    console.log(`${icon} ${r.symbol.padEnd(10)} [${r.source}] ${countStr}`);
    if (r.warning) {
      console.log(`      → ${r.warning}`);
    }
  }

  console.log('');
  console.log(`✅ 가용: ${ok.length}개  ❌ 제외: ${ng.length}개`);

  if (ng.length > 0) {
    console.log('\n⚠️  제외된 심볼:');
    for (const r of ng) {
      console.log(`   - ${r.symbol}: ${r.warning}`);
    }
    console.log('\n💡 데이터 수집 방법:');
    const yfSymbols = ng.filter((r) => r.source === 'yf').map((r) => r.symbol);
    const kisSymbols = ng.filter((r) => r.source === 'kis').map((r) => r.symbol);
    const upbitSymbols = ng.filter((r) => r.source === 'upbit').map((r) => r.symbol);

    if (yfSymbols.length > 0) {
      console.log(`   node scripts/fetch-historical-candles.mjs yf ${yfSymbols.join(' ')}`);
    }
    if (kisSymbols.length > 0) {
      console.log(`   node scripts/fetch-historical-candles.mjs kis ${kisSymbols.join(' ')}`);
    }
    if (upbitSymbols.length > 0) {
      console.log(`   # upbit: ${upbitSymbols.join(', ')} → Upbit collector 통해 수집`);
    }
  }
  console.log('='.repeat(60) + '\n');
}

// ============================================================
// 포트폴리오 Walk-Forward 엔진
// ============================================================

export async function runPortfolioWalkForward(params: {
  symbolRaws: string[];           // 원본 심볼 목록 (예: ['AAPL','BTC','000660'])
  createStrategy: (symbol: string) => Strategy; // 심볼별 전략 팩토리
  startDate: string;
  endDate: string;
  capital: Big;
  commission: number;
  wfConfig: WalkForwardConfig;
  maxPositions: number;           // 동시 최대 보유 종목 (기본 5)
  useSPYFilter: boolean;          // SPY < MA200 시 Long 금지
  minOosTrades: number;           // 창 유효성 기준 거래수
  minSymbolWindowRatio?: number;  // 심볼별 최소 유효창 비율 (0~1, 0=비활성)
  maxSymbolWeight?: number;       // 심볼별 최대 비중 (0~1, 0=무제한)
  slippageBps?: number;           // 고정 슬리피지 (bp, 0=기본 프리셋)
  weightingMode?: 'equal' | 'inv-vol'; // 가중치 모드 (기본: equal)
  volLookback?: number;           // inv-vol 계산용 룩백 기간 (기본: 30일)
  ddReducePct?: number;           // DD 감속 임계값 (%, 예: 10 → DD 10% 이상 시 포지션 50%)
  ddHaltPct?: number;             // DD 중단 임계값 (%, 예: 15 → DD 15% 이상 시 현금 전환)
  ddLookback?: number;            // Rolling DD 룩백 창 수 (0=전체 누적, 12=최근 12창)
  symbolMaFilter?: boolean;       // 심볼별 MA 필터 (IS 마지막 종가 < MA → 해당 창 제외)
  symbolMaPeriod?: number;        // 심볼별 MA 기간 (기본: 50)
}): Promise<PortfolioWalkForwardResult> {
  const {
    symbolRaws,
    createStrategy,
    startDate,
    endDate,
    capital,
    commission,
    wfConfig,
    maxPositions,
    useSPYFilter,
    minOosTrades,
  } = params;

  // ── 0. 데이터 사전 체크 ──────────────────────────────────────
  const checks = await checkDataAvailability({
    symbolRaws,
    startDate,
    endDate,
    warmupDays: wfConfig.warmupDays ?? 0,
    inSampleDays: wfConfig.inSampleDays,
    outSampleDays: wfConfig.outSampleDays,
  });
  printDataAvailability(checks);

  // 데이터 불충분 심볼 자동 제외 (유효 심볼만 진행)
  const availableRaws = symbolRaws.filter((raw) => {
    const { symbol } = resolveSymbol(raw);
    const check = checks.find((c) => c.symbol === symbol);
    return check?.available === true;
  });

  if (availableRaws.length === 0) {
    throw new Error(
      '⛔ 모든 심볼의 데이터가 불충분합니다. 데이터 수집 후 재실행하세요.\n' +
      '   → node scripts/fetch-historical-candles.mjs yf AAPL MSFT NVDA QQQ SPY'
    );
  }

  let resolved = availableRaws.map(resolveSymbol);
  let symbols = resolved.map((r) => r.symbol);
  const strategyName = createStrategy(symbols[0] ?? 'AAPL').name;

  logger.info('포트폴리오 WF 시작', {
    symbols,
    startDate,
    endDate,
    maxPositions,
    useSPYFilter,
    wfConfig,
  });

  // 1. 각 심볼 WF 독립 실행
  const symbolResults: Map<string, WalkForwardWindowResult[]> = new Map();

  for (const { symbol, source } of resolved) {
    logger.info(`[${symbol}] WF 실행 중...`);
    const slippagePreset = SLIPPAGE_PRESETS[source];
    // slippageBps > 0이면 fixed 모델로 override (Stress 시나리오)
    const slippageBps = params.slippageBps ?? 0;
    const slippageModel = slippageBps > 0 ? 'fixed' as const : slippagePreset.model;
    const slippageFixedPct = slippageBps > 0 ? slippageBps / 100 : (slippagePreset.fixedPct ?? 0);
    const config: BacktestConfig = {
      symbol,
      startDate,
      endDate,
      initialCapital: capital,
      commission,
      slippage: {
        model: slippageModel,
        orderSize: new Big(0),
        avgVolume: new Big(0),
        bidAskSpread: new Big(0),
        fixedPct: slippageFixedPct,
        stressMultiplier: 1.0,
      },
    };

    try {
      const strategy = createStrategy(symbol);
      const wfResult = await runWalkForward(strategy, config, wfConfig);
      symbolResults.set(symbol, wfResult.windows);
      logger.info(`[${symbol}] WF 완료 (${wfResult.windows.length}창)`);
    } catch (err) {
      logger.warn(`[${symbol}] WF 실패 - 건너뜀`, { error: String(err) });
      symbolResults.set(symbol, []);
    }
  }

  // 1.5. Valid window ratio 가드: 유효창 비율이 낮은 심볼 자동 제외
  const minRatio = params.minSymbolWindowRatio ?? 0;
  if (minRatio > 0) {
    const totalWindows = Math.max(...[...symbolResults.values()].map((w) => w.length), 1);
    const excluded: string[] = [];

    resolved = resolved.filter(({ symbol }) => {
      const windows = symbolResults.get(symbol) ?? [];
      if (windows.length === 0) {
        excluded.push(symbol);
        return false;
      }
      const validCount = windows.filter((w) => w.status !== 'insufficient_trades').length;
      const ratio = validCount / totalWindows;
      if (ratio < minRatio) {
        logger.warn(`[${symbol}] 유효창 비율 ${(ratio * 100).toFixed(1)}% < ${(minRatio * 100).toFixed(0)}% → 제외`);
        excluded.push(symbol);
        return false;
      }
      return true;
    });
    symbols = resolved.map((r) => r.symbol);

    if (excluded.length > 0) {
      console.log(`\n⚠️  유효창 비율(≥${(minRatio * 100).toFixed(0)}%) 미달로 제외: ${excluded.join(', ')}`);
    }
  }

  // 2. 창 목록 기준 심볼 생성 (가장 많은 창을 가진 심볼 기준)
  let referenceWindows: WalkForwardWindowResult[] = [];
  for (const [, windows] of symbolResults) {
    if (windows.length > referenceWindows.length) {
      referenceWindows = windows;
    }
  }

  if (referenceWindows.length === 0) {
    throw new Error('모든 심볼 WF 실패. 데이터 기간을 확인하세요.');
  }

  // 3. SPY MA200 레짐 필터 준비 (IS 종료 시점 종가 vs MA200)
  // 미래 데이터(OOS 수익률)를 사용하지 않고 IS 마지막 날 기준으로 판단
  const spySymbol = resolveSymbol('SPY').symbol;
  const spyMA200FilterByWindow = new Map<string, boolean>();

  if (useSPYFilter) {
    // MA200 계산을 위해 startDate보다 200일 앞서서 SPY 캔들 로드
    const spyLoadStart =
      DateTime.fromISO(startDate).minus({ days: 250 }).toISODate() ?? startDate;
    try {
      const spyCandles = await loadCandles({
        symbol: spySymbol,
        startDate: spyLoadStart,
        endDate: endDate,
        source: 'yf',
      });

      for (const refWindow of referenceWindows) {
        const isEnd = refWindow.window.inSampleEnd;
        // IS 종료일까지의 캔들 (시간 문자열 비교)
        const candlesUpToIsEnd = spyCandles.filter((c) => c.candleTime <= isEnd);

        if (candlesUpToIsEnd.length < 200) {
          // MA200 계산 불가 → 필터 미적용 (데이터 부족)
          spyMA200FilterByWindow.set(refWindow.window.outSampleStart, false);
        } else {
          const recent200 = candlesUpToIsEnd.slice(-200);
          const ma200 = recent200
            .reduce((sum, c) => sum.plus(c.close), new Big(0))
            .div(200);
          const lastClose = candlesUpToIsEnd[candlesUpToIsEnd.length - 1]!.close;
          // lastClose < MA200 → 약세장 → 필터 ON (Long 금지)
          spyMA200FilterByWindow.set(refWindow.window.outSampleStart, lastClose.lt(ma200));
        }
      }
      logger.info('SPY MA200 레짐 필터 초기화 완료', {
        spyCandleCount: spyCandles.length,
        filteredWindows: [...spyMA200FilterByWindow.values()].filter(Boolean).length,
      });
    } catch (err) {
      logger.warn('SPY MA200 필터 초기화 실패 - 필터 비활성화', { error: String(err) });
    }
  }

  // 3.5. 심볼별 개별 MA 필터 준비 (IS 종료 시점 종가 vs 심볼 자체 MA)
  // 목적: BTC/코인처럼 SPY와 독립적으로 하락하는 자산 자동 제외
  const symbolMaFilterMap = new Map<string, Map<string, boolean>>();
  // Map<symbol, Map<oosPeriodKey, isBearish>>

  if (params.symbolMaFilter) {
    const maPeriod = params.symbolMaPeriod ?? 50;
    const maLoadExtraDays = maPeriod + 30; // 여유 있게 로드

    for (const { symbol, source } of resolved) {
      const maLoadStart =
        DateTime.fromISO(startDate).minus({ days: maLoadExtraDays }).toISODate() ?? startDate;
      try {
        const candles = await loadCandles({
          symbol,
          startDate: maLoadStart,
          endDate,
          source,
        });

        const filterByWindow = new Map<string, boolean>();
        for (const refWindow of referenceWindows) {
          const isEnd = refWindow.window.inSampleEnd;
          const candlesUpToIsEnd = candles.filter((c) => c.candleTime <= isEnd);

          if (candlesUpToIsEnd.length < maPeriod) {
            // 데이터 부족 → 필터 미적용
            filterByWindow.set(refWindow.window.outSampleStart, false);
          } else {
            const recentN = candlesUpToIsEnd.slice(-maPeriod);
            const ma = recentN
              .reduce((sum, c) => sum.plus(c.close), new Big(0))
              .div(maPeriod);
            const lastClose = candlesUpToIsEnd[candlesUpToIsEnd.length - 1]!.close;
            // lastClose < MA → 하락 추세 → 필터 ON (해당 창 제외)
            filterByWindow.set(refWindow.window.outSampleStart, lastClose.lt(ma));
          }
        }
        symbolMaFilterMap.set(symbol, filterByWindow);
        const blockedCount = [...filterByWindow.values()].filter(Boolean).length;
        logger.info(`[${symbol}] MA${maPeriod} 개별 필터 초기화 완료 (${blockedCount}창 차단)`);
      } catch (err) {
        logger.warn(`[${symbol}] MA 개별 필터 초기화 실패 - 해당 심볼 필터 비활성화`, { error: String(err) });
      }
    }
  }

  // 4. 창별 포트폴리오 집계
  const portfolioWindows: PortfolioWindowResult[] = [];

  // DD 추적 상태 (Rolling 또는 전체 누적)
  const ddLookback = params.ddLookback ?? 0; // 0=전체 누적, N>0=최근 N창
  const windowEquities: number[] = [1.0]; // 창별 누적 equity 기록 (초기=1.0)
  const ddReduceThreshold = (params.ddReducePct ?? 0) / 100;
  const ddHaltThreshold = (params.ddHaltPct ?? 0) / 100;

  for (let i = 0; i < referenceWindows.length; i++) {
    const refWindow = referenceWindows[i];
    if (!refWindow) continue;
    const oosPeriodKey = refWindow.window.outSampleStart;

    // SPY MA200 레짐 필터: IS 마지막 종가 < MA200 → 약세장 → Long 금지
    const spyFilterApplied = useSPYFilter && (spyMA200FilterByWindow.get(oosPeriodKey) === true);

    // 각 심볼 OOS/IS 수익률 수집
    const symbolReturns: Record<string, number | null> = {};
    const symbolIsReturns: Record<string, number> = {}; // IS 수익률 (종목 선택 기준)
    let totalOosTrades = 0;

    for (const symbol of symbols) {
      const windows = symbolResults.get(symbol) ?? [];
      // 같은 OOS 시작일을 가진 창 찾기
      const matching = windows.find((w) => w.window.outSampleStart === oosPeriodKey);

      if (!matching || matching.status === 'insufficient_trades') {
        symbolReturns[symbol] = null; // 데이터 없거나 거래 부족
      } else {
        // 심볼 개별 MA 필터: 해당 심볼 하락 추세면 제외
        const symbolBearish = params.symbolMaFilter
          ? (symbolMaFilterMap.get(symbol)?.get(oosPeriodKey) === true)
          : false;
        if (symbolBearish) {
          symbolReturns[symbol] = null; // MA 필터로 제외
        } else {
          symbolReturns[symbol] = matching.outSampleResult.totalReturn;
          symbolIsReturns[symbol] = matching.inSampleResult.totalReturn;
          totalOosTrades += matching.oosTrades;
        }
      }
    }

    // 활성 종목 선정: null이 아닌 종목 중 SPY 필터 적용 후 최대 N개
    let candidates = Object.entries(symbolReturns)
      .filter(([, ret]) => ret !== null)
      .map(([sym, ret]) => ({ symbol: sym, ret: ret as number }));

    let portfolioReturn = 0;
    let activeSymbols: string[] = [];
    let status: 'valid' | 'insufficient_trades' | 'spy_blocked' | 'dd_halted' | 'dd_reduced' = 'valid';

    if (spyFilterApplied) {
      // SPY 레짐 필터: 현금 유지 (신규 Long 금지)
      portfolioReturn = 0;
      activeSymbols = [];
      status = 'spy_blocked';
    } else {
      // IS 수익률 기준으로 상위 N개 선택 (Lookahead Bias 제거: OOS 수익률 미사용)
      candidates.sort((a, b) =>
        (symbolIsReturns[b.symbol] ?? -Infinity) - (symbolIsReturns[a.symbol] ?? -Infinity)
      );
      const selected = candidates.slice(0, maxPositions);

      if (selected.length === 0) {
        portfolioReturn = 0;
        activeSymbols = [];
        status = 'insufficient_trades';
      } else {
        let weights: Record<string, number>;
        if (params.weightingMode === 'inv-vol') {
          // inv-vol: OOS 시작일 기준 이전 N일 변동성의 역수로 가중치
          const vols = await calcSymbolVols(
            resolved.filter((r) => selected.some((s) => s.symbol === r.symbol)),
            oosPeriodKey,
            params.volLookback ?? 30,
          );
          weights = calcInvVolWeights(selected.map((c) => c.symbol), vols, params.maxSymbolWeight);
        } else {
          weights = calcWeights(selected.map((c) => c.symbol), params.maxSymbolWeight);
        }
        portfolioReturn = selected.reduce((sum, c) => sum + c.ret * (weights[c.symbol] ?? 0), 0);
        activeSymbols = selected.map((c) => c.symbol);
        status = totalOosTrades >= minOosTrades ? 'valid' : 'insufficient_trades';
      }
    }

    // ── DD 감속/중단 룰 적용 (Rolling DD 지원) ───────────────
    let positionScalar = 1.0;

    // Rolling 구간 계산: ddLookback=0 이면 전체, N>0이면 최근 N+1개 equity 포인트 사용
    const lookbackSlice = ddLookback > 0
      ? windowEquities.slice(-(ddLookback + 1))
      : windowEquities;
    const rollingPeak = Math.max(...lookbackSlice);
    const rollingCurrent = lookbackSlice[lookbackSlice.length - 1] ?? 1.0;
    const currentDD = rollingPeak > 0 ? (rollingPeak - rollingCurrent) / rollingPeak : 0;

    if (status !== 'insufficient_trades' && ddHaltThreshold > 0 && currentDD >= ddHaltThreshold) {
      // DD 중단: 현금 전환
      portfolioReturn = 0;
      activeSymbols = [];
      status = 'dd_halted';
      positionScalar = 0;
    } else if (status === 'valid' && ddReduceThreshold > 0 && currentDD >= ddReduceThreshold) {
      // DD 감속: 포지션 50% 축소
      portfolioReturn *= 0.5;
      positionScalar = 0.5;
      status = 'dd_reduced';
    }

    // 누적 equity 업데이트 (halted가 아닐 때만)
    const prevEquity = windowEquities[windowEquities.length - 1] ?? 1.0;
    if (status !== 'dd_halted') {
      windowEquities.push(prevEquity * (1 + portfolioReturn / 100));
    } else {
      // DD 중단: equity 고정 (수익 0)
      windowEquities.push(prevEquity);
    }

    portfolioWindows.push({
      windowIndex: i,
      inSampleStart: refWindow.window.inSampleStart,
      inSampleEnd: refWindow.window.inSampleEnd,
      outSampleStart: refWindow.window.outSampleStart,
      outSampleEnd: refWindow.window.outSampleEnd,
      symbolReturns,
      portfolioReturn,
      activeSymbols,
      spyFilterApplied,
      totalOosTrades,
      positionScalar,
      ddAtWindow: currentDD * 100,
      status,
    });
  }

  // 5. 포트폴리오 집계 지표 계산
  // dd_reduced는 포지션 축소 후 수익이므로 valid로 포함, dd_halted는 제외
  const validWindows = portfolioWindows.filter(
    (w) => w.status === 'valid' || w.status === 'dd_reduced'
  );
  const allReturns = portfolioWindows.map((w) => w.portfolioReturn);
  const validReturns = validWindows.map((w) => w.portfolioReturn);

  const positiveWindowCount = validWindows.filter((w) => w.portfolioReturn > 0).length;
  const totalValidWindows = validWindows.length;
  const positiveRatio = totalValidWindows > 0 ? positiveWindowCount / totalValidWindows : 0;

  const avgOosReturn = validReturns.length > 0
    ? validReturns.reduce((s, r) => s + r, 0) / validReturns.length
    : 0;

  const sortedReturns = [...validReturns].sort((a, b) => a - b);
  const midIdx = Math.floor(sortedReturns.length / 2);
  const medianOosReturn = sortedReturns.length > 0
    ? (sortedReturns.length % 2 === 0
        ? ((sortedReturns[midIdx - 1] ?? 0) + (sortedReturns[midIdx] ?? 0)) / 2
        : (sortedReturns[midIdx] ?? 0))
    : 0;

  // MDD 계산 (누적 수익 기준)
  const maxDrawdown = calculateMaxDrawdown(allReturns);

  // Sharpe 추정 (단순화: 평균/표준편차)
  const sharpeEstimate = calculateSharpeEstimate(validReturns);

  const oosConsistencyPass = positiveRatio >= 0.4 && medianOosReturn >= 0;

  // 6. 심볼별 기여도 계산
  const symbolContributions = symbols.map((symbol) => {
    const rets = portfolioWindows
      .map((w) => w.symbolReturns[symbol])
      .filter((r): r is number => r !== null);
    const avgReturn = rets.length > 0 ? rets.reduce((s, r) => s + r, 0) / rets.length : 0;
    return { symbol, avgReturn, validWindows: rets.length };
  });
  symbolContributions.sort((a, b) => b.avgReturn - a.avgReturn);

  logger.info('포트폴리오 WF 완료', {
    totalWindows: portfolioWindows.length,
    validWindows: totalValidWindows,
    positiveRatio: `${(positiveRatio * 100).toFixed(1)}%`,
    medianOosReturn: `${medianOosReturn.toFixed(2)}%`,
    oosConsistencyPass,
  });

  return {
    symbols,
    startDate,
    endDate,
    wfConfig,
    windows: portfolioWindows,
    aggregated: {
      medianOosReturn,
      avgOosReturn,
      positiveWindowCount,
      totalValidWindows,
      positiveRatio,
      maxDrawdown,
      sharpeEstimate,
      oosConsistencyPass,
    },
    symbolContributions,
    strategyName,
  };
}

// ============================================================
// 내부 헬퍼
// ============================================================

/**
 * OOS 시작일 이전 N일 캔들의 일간 수익률 표준편차 계산
 */
async function calcSymbolVols(
  resolved: Array<{ symbol: string; source: 'upbit' | 'kis' | 'yf' }>,
  oosPeriodStart: string,
  lookback: number,
): Promise<Record<string, number>> {
  const endDate = DateTime.fromISO(oosPeriodStart).minus({ days: 1 }).toISODate() ?? oosPeriodStart;
  // 거래일 기준으로 lookback × 1.5배 달력일 로드
  const startDate = DateTime.fromISO(oosPeriodStart).minus({ days: Math.ceil(lookback * 1.5) }).toISODate() ?? oosPeriodStart;
  const vols: Record<string, number> = {};

  for (const { symbol, source } of resolved) {
    try {
      const candles = await loadCandles({ symbol, startDate, endDate, source });
      const recent = candles.slice(-lookback);
      if (recent.length < 5) { vols[symbol] = Infinity; continue; }

      const returns: number[] = [];
      for (let j = 1; j < recent.length; j++) {
        const prev = recent[j - 1]!.close;
        const curr = recent[j]!.close;
        if (prev.gt(0)) returns.push(curr.minus(prev).div(prev).toNumber());
      }
      if (returns.length < 2) { vols[symbol] = Infinity; continue; }
      const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
      const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
      vols[symbol] = Math.sqrt(Math.max(variance, 0));
    } catch {
      vols[symbol] = Infinity;
    }
  }
  return vols;
}

/**
 * Inverse-Vol 가중치 계산 후 maxWeight cap + 정규화 적용
 */
function calcInvVolWeights(
  symbols: string[],
  vols: Record<string, number>,
  maxWeight: number | undefined,
): Record<string, number> {
  const invVols: Record<string, number> = {};
  let totalInvVol = 0;
  for (const s of symbols) {
    const vol = vols[s] ?? Infinity;
    const inv = vol > 0 && isFinite(vol) ? 1 / vol : 0;
    invVols[s] = inv;
    totalInvVol += inv;
  }
  // inv-vol 계산 불가 시 균등 배분으로 fallback
  if (totalInvVol <= 0) return calcWeights(symbols, maxWeight);

  const weights: Record<string, number> = {};
  for (const s of symbols) {
    weights[s] = (invVols[s] ?? 0) / totalInvVol;
  }
  // maxWeight cap 적용
  return applyCapAndNormalize(weights, symbols, maxWeight);
}

/**
 * 동일비중 배분 후 maxWeight cap 적용 (초과분 비cap 종목에 재배분)
 * maxWeight <= 0 이면 순수 동일비중 반환
 */
function calcWeights(
  symbols: string[],
  maxWeight: number | undefined,
): Record<string, number> {
  const n = symbols.length;
  if (n === 0) return {};
  const weights: Record<string, number> = {};
  for (const s of symbols) weights[s] = 1 / n;
  return applyCapAndNormalize(weights, symbols, maxWeight);
}

/**
 * 가중치 딕셔너리에 maxWeight cap 적용 후 정규화
 * (동일비중/inv-vol 모두 공통 사용)
 */
function applyCapAndNormalize(
  weights: Record<string, number>,
  symbols: string[],
  maxWeight: number | undefined,
): Record<string, number> {
  const cap = maxWeight && maxWeight > 0 ? maxWeight : 0;

  if (cap > 0) {
    // 초과분을 uncapped 심볼에 재배분 (최대 20회)
    for (let iter = 0; iter < 20; iter++) {
      let excess = 0;
      let uncappedCount = 0;
      for (const s of symbols) {
        const w = weights[s] ?? 0;
        if (w > cap) {
          excess += w - cap;
          weights[s] = cap;
        } else {
          uncappedCount++;
        }
      }
      if (excess < 1e-10 || uncappedCount === 0) break;
      const add = excess / uncappedCount;
      for (const s of symbols) {
        if ((weights[s] ?? 0) < cap) weights[s] = (weights[s] ?? 0) + add;
      }
    }
  }

  // 최종 정규화 (부동소수점 오류 보정)
  const total = Object.values(weights).reduce((s, w) => s + w, 0);
  if (total > 1e-10) {
    for (const s of symbols) weights[s] = (weights[s] ?? 0) / total;
  }
  return weights;
}

function calculateMaxDrawdown(returns: number[]): number {
  let peak = 0;
  let cumulative = 0;
  let maxDD = 0;
  for (const r of returns) {
    cumulative += r;
    if (cumulative > peak) peak = cumulative;
    const dd = peak - cumulative;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calculateSharpeEstimate(returns: number[]): number {
  if (returns.length < 2) return 0;
  const avg = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - avg) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  return std > 0 ? avg / std : 0;
}
