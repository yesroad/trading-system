#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger } from '@workspace/shared-utils';
import { runBacktest } from './engine/backtest.js';
import { runWalkForward } from './engine/walk-forward.js';
import { generateBacktestReport, generateWalkForwardReport, validatePerformance } from './reports/reporter.js';
import { saveBacktestResult, saveWalkForwardResult } from './storage/saver.js';
import { SimpleMAStrategy } from './strategies/simple-ma-crossover.js';
import { EnhancedMAStrategy } from './strategies/enhanced-ma-strategy.js';
import { BBSqueezeStrategy } from './strategies/bb-squeeze-strategy.js';
import { RegimeAdaptiveStrategy } from './strategies/regime-adaptive-strategy.js';
import { SLIPPAGE_PRESETS } from './models/slippage.js';
import type { BacktestConfig, WalkForwardConfig } from './types.js';
import { runLiveSignal } from './commands/live-signal.js';
import { detectRegime } from './commands/detect-regime.js';
import { runPortfolioWF } from './commands/portfolio-wf.js';
import { runPortfolioSignal } from './commands/portfolio-signal.js';

const logger = createLogger('backtest-cli');
const program = new Command();

program
  .name('backtest')
  .description('백테스트 엔진 CLI')
  .version('1.0.0');

/**
 * 단순 백테스트 명령
 */
program
  .command('run')
  .description('단순 백테스트 실행')
  .requiredOption('-s, --symbol <symbol>', '심볼 (예: KRW-BTC, 005930, AAPL)')
  .option('--start <date>', '시작 날짜 (YYYY-MM-DD)', getDefaultStartDate())
  .option('--end <date>', '종료 날짜 (YYYY-MM-DD)', getDefaultEndDate())
  .option('--capital <amount>', '초기 자본', '10000000')
  .option('--commission <pct>', '수수료 (%)', '0.05')
  .option('--strategy <name>', '전략 (simple-ma | enhanced-ma | bb-squeeze | regime-adaptive)', 'simple-ma')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .option('--position-size <pct>', '포지션 크기 (0~1)', '0.95')
  .option('--atr-multiplier <multiplier>', 'ATR 배수', '2.0')
  .option('--slope-period <days>', '기울기 룩백 기간 (Enhanced MA)', '5')
  .option('--use-200ma-filter', '200일 MA 레짐 필터 활성화 (Enhanced MA)')
  .option('--ma200-period <period>', '레짐 필터 MA 기간 (기본 200, 데이터 부족 시 60 권장)', '200')
  .option('--use-adx-filter', 'ADX 추세 필터 활성화 (Enhanced MA)')
  .option('--adx-threshold <value>', 'ADX 임계값 (Enhanced MA)', '20')
  .option('--bb-period <period>', 'BB 기간 (BB Squeeze)', '20')
  .option('--bb-stddev <multiplier>', 'BB 표준편차 배수 (BB Squeeze)', '2.0')
  .option('--keltner-multiplier <multiplier>', 'Keltner Channel ATR 배수 (BB Squeeze)', '1.5')
  .option('--stress-slippage', '스트레스 슬리피지 모드 (Normal × 4배)')
  .option('--stress-multiplier <n>', '슬리피지 스트레스 배수', '4.0')
  .option('--save', '결과를 DB에 저장', false)
  .action(async (options) => {
    try {
      logger.info('백테스트 시작', options);

      const strategyParams = buildStrategyParams(options);

      // 전략 생성
      const strategy = createStrategy(options.strategy, strategyParams);

      // 슬리피지 모델 결정
      const source = determineSource(options.symbol);
      const slippagePreset = SLIPPAGE_PRESETS[source];

      // 슬리피지 스트레스 배수
      const stressMultiplier = options.stressSlippage
        ? parseFloat(options.stressMultiplier)
        : 1.0;

      if (options.stressSlippage) {
        console.log(`\n⚠️  스트레스 슬리피지 모드: Normal × ${stressMultiplier}배`);
      }

      // 백테스트 설정
      const config: BacktestConfig = {
        symbol: options.symbol,
        startDate: options.start,
        endDate: options.end,
        initialCapital: new Big(options.capital),
        commission: parseFloat(options.commission),
        maxPositionSize: new Big(options.positionSize),
        slippage: {
          model: slippagePreset.model,
          orderSize: new Big(0), // 런타임에 계산
          avgVolume: new Big(0), // 런타임에 계산
          bidAskSpread: new Big(0), // 런타임에 계산
          fixedPct: slippagePreset.fixedPct,
          stressMultiplier,
        },
      };

      // 백테스트 실행
      const result = await runBacktest(strategy, config);

      // 리포트 출력
      const report = generateBacktestReport(result);
      console.log(report);

      // 성과 검증
      const validation = validatePerformance(result.metrics);
      if (!validation.passed) {
        console.log('⚠️ 성과 검증 실패:');
        validation.failures.forEach((f) => console.log(`  - ${f}`));
      } else if (validation.excellent) {
        console.log(`✅ 성과 검증 통과! (우수 기준 달성: ${validation.excellentReasons.join(', ')})`);
      } else {
        console.log('✅ 성과 검증 통과!');
      }

      // DB 저장
      if (options.save) {
        const runId = await saveBacktestResult(result, strategyParams);
        console.log(`\n💾 결과 저장 완료 (run_id: ${runId})`);
      }
    } catch (error) {
      logger.error('백테스트 실패', { error });
      console.error(`❌ 백테스트 실패: ${error}`);
      process.exit(1);
    }
  });

/**
 * Walk-Forward 분석 명령
 */
program
  .command('walk-forward')
  .description('Walk-Forward 분석 실행')
  .requiredOption('-s, --symbol <symbol>', '심볼 (예: KRW-BTC, 005930, AAPL)')
  .option('--start <date>', '시작 날짜 (YYYY-MM-DD)', getDefaultStartDate(365))
  .option('--end <date>', '종료 날짜 (YYYY-MM-DD)', getDefaultEndDate())
  .option('--capital <amount>', '초기 자본', '10000000')
  .option('--commission <pct>', '수수료 (%)', '0.05')
  .option('--strategy <name>', '전략 (simple-ma | enhanced-ma | bb-squeeze | regime-adaptive)', 'simple-ma')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .option('--position-size <pct>', '포지션 크기 (0~1)', '0.95')
  .option('--atr-multiplier <multiplier>', 'ATR 배수', '2.0')
  .option('--slope-period <days>', '기울기 룩백 기간 (Enhanced MA)', '5')
  .option('--use-200ma-filter', '200일 MA 레짐 필터 활성화 (Enhanced MA)')
  .option('--ma200-period <period>', '레짐 필터 MA 기간 (기본 200, 데이터 부족 시 60 권장)', '200')
  .option('--use-adx-filter', 'ADX 추세 필터 활성화 (Enhanced MA)')
  .option('--adx-threshold <value>', 'ADX 임계값 (Enhanced MA)', '20')
  .option('--bb-period <period>', 'BB 기간 (BB Squeeze)', '20')
  .option('--bb-stddev <multiplier>', 'BB 표준편차 배수 (BB Squeeze)', '2.0')
  .option('--keltner-multiplier <multiplier>', 'Keltner Channel ATR 배수 (BB Squeeze)', '1.5')
  .option('--in-sample <days>', 'In-Sample 기간 (일)', '90')
  .option('--out-sample <days>', 'Out-of-Sample 기간 (일)', '30')
  .option('--step <days>', '이동 간격 (일)', '15')
  .option('--min-oos-trades <n>', 'OOS 최소 거래 수 (미달 시 평가불가)', '3')
  .option('--warmup <days>', '지표 워밍업 기간 (200MA 필터 사용 시 210 권장, 기본: 0)', '0')
  .option('--stress-slippage', '스트레스 슬리피지 모드 (Normal × 4배)')
  .option('--stress-multiplier <n>', '슬리피지 스트레스 배수', '4.0')
  .option('--save', '결과를 DB에 저장', false)
  .action(async (options) => {
    try {
      logger.info('Walk-Forward 분석 시작', options);

      const strategyParams = buildStrategyParams(options);

      // 전략 생성
      const strategy = createStrategy(options.strategy, strategyParams);

      // 슬리피지 스트레스 배수
      const stressMultiplier = options.stressSlippage
        ? parseFloat(options.stressMultiplier)
        : 1.0;

      if (options.stressSlippage) {
        console.log(`\n⚠️  스트레스 슬리피지 모드: Normal × ${stressMultiplier}배`);
      }

      // 슬리피지 모델 결정
      const source = determineSource(options.symbol);
      const slippagePreset = SLIPPAGE_PRESETS[source];

      // 백테스트 설정
      const config: BacktestConfig = {
        symbol: options.symbol,
        startDate: options.start,
        endDate: options.end,
        initialCapital: new Big(options.capital),
        commission: parseFloat(options.commission),
        maxPositionSize: new Big(options.positionSize),
        slippage: {
          model: slippagePreset.model,
          orderSize: new Big(0),
          avgVolume: new Big(0),
          bidAskSpread: new Big(0),
          fixedPct: slippagePreset.fixedPct,
          stressMultiplier,
        },
      };

      // Walk-Forward 설정
      const wfConfig: WalkForwardConfig = {
        inSampleDays: parseInt(options.inSample),
        outSampleDays: parseInt(options.outSample),
        stepDays: parseInt(options.step),
        minOosTrades: parseInt(options.minOosTrades),
        warmupDays: parseInt(options.warmup),
      };

      // Walk-Forward 분석 실행
      const result = await runWalkForward(strategy, config, wfConfig);

      // 리포트 출력
      const report = generateWalkForwardReport(result);
      console.log(report);

      // 성과 검증 (Out-of-Sample 기준)
      const validation = validatePerformance(result.outSampleMetrics);
      if (!validation.passed) {
        console.log('⚠️ Out-of-Sample 성과 검증 실패:');
        validation.failures.forEach((f) => console.log(`  - ${f}`));
      } else if (validation.excellent) {
        console.log(`✅ Out-of-Sample 성과 검증 통과! (우수: ${validation.excellentReasons.join(', ')})`);
      } else {
        console.log('✅ Out-of-Sample 성과 검증 통과!');
      }

      // DB 저장
      if (options.save) {
        const runId = await saveWalkForwardResult(result, strategyParams);
        console.log(`\n💾 결과 저장 완료 (run_id: ${runId})`);
      }
    } catch (error) {
      logger.error('Walk-Forward 분석 실패', { error });
      console.error(`❌ Walk-Forward 분석 실패: ${error}`);
      process.exit(1);
    }
  });

/**
 * 실시간 신호 생성 명령
 */
program
  .command('signal')
  .description('실시간 매매 신호 생성 → trading_signals 저장')
  .requiredOption('-s, --symbol <symbol>', '심볼 (예: 000660, KRW-BTC, AAPL)')
  .option('--lookback <days>', '캔들 조회 기간 (일)', '60')
  .option('--strategy <name>', '전략 (enhanced-ma | simple-ma | bb-squeeze)', 'enhanced-ma')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .option('--atr-multiplier <multiplier>', 'ATR 배수', '2.0')
  .option('--slope-period <days>', '기울기 룩백 기간 (Enhanced MA)', '5')
  .option('--use-200ma-filter', '200일 MA 레짐 필터 활성화 (Enhanced MA)')
  .option('--ma200-period <period>', '레짐 필터 MA 기간 (기본 200, 데이터 부족 시 60 권장)', '200')
  .option('--use-adx-filter', 'ADX 추세 필터 활성화 (Enhanced MA)')
  .option('--adx-threshold <value>', 'ADX 임계값 (Enhanced MA)', '20')
  .option('--bb-period <period>', 'BB 기간 (BB Squeeze)', '20')
  .option('--bb-stddev <multiplier>', 'BB 표준편차 배수 (BB Squeeze)', '2.0')
  .option('--keltner-multiplier <multiplier>', 'Keltner Channel ATR 배수 (BB Squeeze)', '1.5')
  .option('--no-dry-run', '실제 DB 저장 (기본: dry-run 모드)')
  .action(async (options) => {
    try {
      await runLiveSignal({
        symbol: options.symbol,
        lookbackDays: parseInt(options.lookback),
        strategy: options.strategy,
        shortMa: parseInt(options.shortMa),
        longMa: parseInt(options.longMa),
        atrMultiplier: parseFloat(options.atrMultiplier),
        slopePeriod: parseInt(options.slopePeriod),
        use200MaFilter: (options['use200maFilter'] ?? options.use200MaFilter) === true,
        ma200Period: parseInt((options['ma200Period'] ?? options['ma200period'] ?? '200') as string),
        useAdxFilter: options.useAdxFilter === true,
        adxThreshold: parseFloat(options.adxThreshold),
        bbPeriod: parseInt(options.bbPeriod),
        bbStdDev: parseFloat(options.bbStddev),
        keltnerMultiplier: parseFloat(options.keltnerMultiplier),
        dryRun: options.dryRun !== false,
      });
    } catch (error) {
      logger.error('신호 생성 실패', { error });
      console.error(`❌ 신호 생성 실패: ${error}`);
      process.exit(1);
    }
  });

/**
 * CLI 옵션에서 공통 전략 파라미터 추출
 */
function buildStrategyParams(options: Record<string, unknown>): Record<string, unknown> {
  return {
    shortPeriod: parseInt(options.shortMa as string),
    longPeriod: parseInt(options.longMa as string),
    atrMultiplier: parseFloat(options.atrMultiplier as string),
    slopePeriod: parseInt(options.slopePeriod as string),
    // Commander.js: --use-200ma-filter → use200maFilter (lowercase 'ma')
    use200MaFilter: (options['use200maFilter'] ?? options.use200MaFilter) === true,
    // Commander.js: --ma200-period → ma200Period (정상 camelCase)
    ma200Period: parseInt((options['ma200Period'] ?? options['ma200period'] ?? '200') as string),
    useAdxFilter: options.useAdxFilter === true,
    adxThreshold: parseFloat(options.adxThreshold as string),
    bbPeriod: parseInt(options.bbPeriod as string),
    bbStdDev: parseFloat(options.bbStddev as string),
    keltnerMultiplier: parseFloat(options.keltnerMultiplier as string),
  };
}

/**
 * 전략 생성
 */
function createStrategy(name: string, params: Record<string, unknown>) {
  switch (name) {
    case 'simple-ma':
      return new SimpleMAStrategy({
        shortPeriod: params.shortPeriod as number,
        longPeriod: params.longPeriod as number,
      });
    case 'enhanced-ma':
      return new EnhancedMAStrategy({
        shortPeriod: params.shortPeriod as number,
        longPeriod: params.longPeriod as number,
        atrMultiplier: params.atrMultiplier as number | undefined,
        slopePeriod: params.slopePeriod as number | undefined,
        use200MaFilter: params.use200MaFilter as boolean | undefined,
        ma200Period: params.ma200Period as number | undefined,
        useAdxFilter: params.useAdxFilter as boolean | undefined,
        adxThreshold: params.adxThreshold as number | undefined,
      });
    case 'bb-squeeze':
      return new BBSqueezeStrategy({
        bbPeriod: params.bbPeriod as number | undefined,
        bbStdDev: params.bbStdDev as number | undefined,
        keltnerMultiplier: params.keltnerMultiplier as number | undefined,
        atrPeriod: 14,
        atrStopMultiplier: params.atrMultiplier as number | undefined,
      });
    case 'regime-adaptive':
      return new RegimeAdaptiveStrategy({
        sma50Period: 50,
        sma200Period: params.ma200Period as number | undefined,
        adxPeriod: params.adxThreshold ? 14 : undefined,
        enhancedMa: {
          shortPeriod: params.shortPeriod as number,
          longPeriod: params.longPeriod as number,
          atrMultiplier: params.atrMultiplier as number | undefined,
          slopePeriod: params.slopePeriod as number | undefined,
          use200MaFilter: params.use200MaFilter as boolean | undefined,
          ma200Period: params.ma200Period as number | undefined,
        },
        bbSqueeze: {
          bbPeriod: params.bbPeriod as number | undefined,
          bbStdDev: params.bbStdDev as number | undefined,
          keltnerMultiplier: params.keltnerMultiplier as number | undefined,
          atrStopMultiplier: params.atrMultiplier as number | undefined,
        },
      });
    default:
      throw new Error(`알 수 없는 전략: ${name}`);
  }
}

/**
 * 심볼로부터 데이터 소스 결정
 */
function determineSource(symbol: string): 'upbit' | 'kis' | 'yf' {
  if (symbol.startsWith('KRW-')) {
    return 'upbit';
  } else if (/^\d{6}$/.test(symbol)) {
    return 'kis';
  } else {
    return 'yf';
  }
}

/**
 * 기본 시작 날짜 (N일 전)
 */
function getDefaultStartDate(daysAgo = 180): string {
  return DateTime.now().minus({ days: daysAgo }).toISODate() ?? '2024-01-01';
}

/**
 * 기본 종료 날짜 (어제)
 */
function getDefaultEndDate(): string {
  return DateTime.now().minus({ days: 1 }).toISODate() ?? DateTime.now().toISODate() ?? '2026-01-01';
}

/**
 * 시장 국면 감지 명령
 */
program
  .command('detect-regime')
  .description('시장 국면 감지 (TRENDING_UP, TRENDING_DOWN, SIDEWAYS)')
  .requiredOption('-s, --symbol <symbol>', '심볼 (예: 005930, AAPL)')
  .option('--start <date>', '시작 날짜 (YYYY-MM-DD)', getDefaultStartDate(365))
  .option('--end <date>', '종료 날짜 (YYYY-MM-DD)', getDefaultEndDate())
  .option('--window <days>', '분석 간격 (일)', '30')
  .option('--sma50 <period>', 'SMA50 기간', '50')
  .option('--sma200 <period>', 'SMA200 기간', '200')
  .option('--adx <period>', 'ADX 기간', '14')
  .action(async (options) => {
    try {
      await detectRegime({
        symbol: options.symbol,
        startDate: options.start,
        endDate: options.end,
        windowDays: parseInt(options.window),
        sma50Period: parseInt(options.sma50),
        sma200Period: parseInt(options.sma200),
        adxPeriod: parseInt(options.adx),
      });
    } catch (error) {
      logger.error('국면 감지 실패', { error });
      console.error(`❌ 국면 감지 실패: ${error}`);
      process.exit(1);
    }
  });

/**
 * 포트폴리오 Walk-Forward 명령
 */
program
  .command('portfolio-wf')
  .description('포트폴리오 단위 Walk-Forward 백테스트 (Regime-Adaptive 전략)')
  .requiredOption('--symbols <list>', '콤마 구분 심볼 목록 (예: AAPL,MSFT,BTC,000660)')
  .option('--start <date>', '시작 날짜 (YYYY-MM-DD)', getDefaultStartDate(730))
  .option('--end <date>', '종료 날짜 (YYYY-MM-DD)', getDefaultEndDate())
  .option('--capital <amount>', '초기 자본 (심볼당)', '10000000')
  .option('--commission <pct>', '수수료 (%)', '0.05')
  .option('--in-sample <days>', 'In-Sample 기간 (일)', '180')
  .option('--out-sample <days>', 'Out-of-Sample 기간 (일)', '90')
  .option('--step <days>', '이동 간격 (일)', '30')
  .option('--min-oos-trades <n>', 'OOS 최소 거래 수', '3')
  .option('--max-positions <n>', '동시 최대 보유 종목 수', '5')
  .option('--spy-filter', 'SPY < MA200 시 신규 Long 금지')
  .option('--warmup <days>', '지표 워밍업 기간 (기본: 210)', '210')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .option('--atr-multiplier <multiplier>', 'ATR 배수', '2.0')
  .option('--slope-period <days>', '기울기 룩백 기간', '5')
  .option('--use-200ma-filter', '200일 MA 레짐 필터 활성화')
  .option('--ma200-period <period>', 'MA200 기간', '200')
  .option('--bb-period <period>', 'BB 기간', '20')
  .option('--bb-stddev <multiplier>', 'BB 표준편차 배수', '2.0')
  .option('--keltner-multiplier <multiplier>', 'Keltner Channel ATR 배수', '1.5')
  .option('--min-symbol-window-ratio <ratio>', '심볼별 최소 유효창 비율 (0~1, 0=비활성)', '0')
  .option('--max-symbol-weight <weight>', '심볼별 최대 비중 (0~1, 0=무제한)', '0')
  .option('--slippage-bps <bps>', '고정 슬리피지 (bp, 0=기본 프리셋)', '0')
  .option('--weighting <mode>', '가중치 모드 (equal|inv-vol)', 'equal')
  .option('--vol-lookback <days>', 'inv-vol 룩백 기간 (일)', '30')
  .option('--stress-compare', '0/30/50bp 동일창 공정 비교 모드')
  .option('--rebalance <mode>', '리밸런싱 주기 (daily|weekly|monthly|oos)', 'oos')
  .option('--dd-reduce-pct <pct>', 'DD 감속 임계값 (%, 0=비활성). 이상 시 포지션 50%', '0')
  .option('--dd-halt-pct <pct>', 'DD 중단 임계값 (%, 0=비활성). 이상 시 현금 전환', '0')
  .option('--dd-lookback <windows>', 'Rolling DD 룩백 창 수 (0=전체 누적, 12=최근 12창)', '0')
  .option('--symbol-ma-filter', '심볼별 MA 필터 (IS 마지막 종가 < MA → 해당 창 제외)')
  .option('--symbol-ma-period <period>', '심볼별 MA 기간 (기본: 50)', '50')
  .option('--us-strategy <name>', '미장(yf) 전략 (regime-adaptive|enhanced-ma|bb-squeeze|simple-ma)', 'regime-adaptive')
  .option('--crypto-strategy <name>', '코인(upbit) 전략 (regime-adaptive|enhanced-ma|bb-squeeze|simple-ma)', 'regime-adaptive')
  .option('--krx-strategy <name>', '국장(kis) 전략 (regime-adaptive|enhanced-ma|bb-squeeze|simple-ma)', 'regime-adaptive')
  .action(async (options) => {
    try {
      const symbols = (options.symbols as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (symbols.length === 0) {
        console.error('❌ 심볼 목록이 비어있습니다.');
        process.exit(1);
      }

      await runPortfolioWF({
        symbols,
        startDate: options.start as string,
        endDate: options.end as string,
        capital: parseFloat(options.capital as string),
        commission: parseFloat(options.commission as string),
        inSample: parseInt(options.inSample as string),
        outSample: parseInt(options.outSample as string),
        step: parseInt(options.step as string),
        minOosTrades: parseInt(options.minOosTrades as string),
        maxPositions: parseInt(options.maxPositions as string),
        useSPYFilter: options.spyFilter === true,
        warmupDays: parseInt(options.warmup as string),
        shortMa: parseInt(options.shortMa as string),
        longMa: parseInt(options.longMa as string),
        atrMultiplier: parseFloat(options.atrMultiplier as string),
        slopePeriod: parseInt(options.slopePeriod as string),
        use200MaFilter: (options['use200maFilter'] ?? options.use200MaFilter) === true,
        ma200Period: parseInt((options['ma200Period'] ?? options['ma200period'] ?? '200') as string),
        bbPeriod: parseInt(options.bbPeriod as string),
        bbStdDev: parseFloat(options.bbStddev as string),
        keltnerMultiplier: parseFloat(options.keltnerMultiplier as string),
        minSymbolWindowRatio: parseFloat(options.minSymbolWindowRatio as string),
        maxSymbolWeight: parseFloat(options.maxSymbolWeight as string),
        slippageBps: parseFloat(options.slippageBps as string),
        weighting: (options.weighting as string) === 'inv-vol' ? 'inv-vol' : 'equal',
        volLookback: parseInt(options.volLookback as string),
        stressCompare: options.stressCompare === true,
        rebalance: (options.rebalance as string) as 'oos' | 'weekly' | 'monthly' | 'daily',
        ddReducePct: parseFloat(options.ddReducePct as string),
        ddHaltPct: parseFloat(options.ddHaltPct as string),
        ddLookback: parseInt(options.ddLookback as string),
        symbolMaFilter: options.symbolMaFilter === true,
        symbolMaPeriod: parseInt(options.symbolMaPeriod as string),
        usStrategy: (options.usStrategy as string) || 'regime-adaptive',
        cryptoStrategy: (options.cryptoStrategy as string) || 'regime-adaptive',
        krxStrategy: (options.krxStrategy as string) || 'regime-adaptive',
      });
    } catch (error) {
      logger.error('포트폴리오 WF 실패', { error });
      console.error(`❌ 포트폴리오 WF 실패: ${error}`);
      process.exit(1);
    }
  });

/**
 * 포트폴리오 실전 신호 생성 커맨드
 */
program
  .command('portfolio-signal')
  .description('포트폴리오 단위 실전 신호 생성 (시장별 전략 + 레짐 필터 적용)')
  .requiredOption('--symbols <list>', '콤마 구분 심볼 목록 (예: MSFT,QQQ,SPY,KRW-BTC)')
  .option('--lookback <days>', '캔들 로드 기간 (일, 워밍업 포함)', '300')
  .option('--spy-filter', 'SPY MA200 레짐 필터 (하락 추세 시 미장 신호 차단)')
  .option('--symbol-ma-filter', '심볼별 MA 필터 (종가 < MA → HOLD)')
  .option('--symbol-ma-period <period>', '심볼별 MA 기간', '50')
  .option('--us-strategy <name>', '미장(yf) 전략 (regime-adaptive|enhanced-ma|bb-squeeze|simple-ma)', 'enhanced-ma')
  .option('--crypto-strategy <name>', '코인(upbit) 전략', 'bb-squeeze')
  .option('--krx-strategy <name>', '국장(kis) 전략', 'bb-squeeze')
  .option('--short-ma <period>', '단기 이평선', '10')
  .option('--long-ma <period>', '장기 이평선', '20')
  .option('--atr-multiplier <n>', 'ATR 손절 배수', '2.0')
  .option('--slope-period <days>', '기울기 룩백 기간', '5')
  .option('--ma200-period <period>', 'MA200 기간', '200')
  .option('--bb-period <period>', 'BB 기간', '20')
  .option('--bb-stddev <n>', 'BB 표준편차 배수', '2.0')
  .option('--keltner-multiplier <n>', 'Keltner ATR 배수', '1.5')
  .option('--dry-run', 'DB 저장 없이 콘솔 출력만 (기본: true)', true)
  .option('--no-dry-run', 'trading_signals 테이블에 실제 저장')
  .action(async (options) => {
    try {
      const symbols = (options.symbols as string).split(',').map((s: string) => s.trim()).filter(Boolean);
      await runPortfolioSignal({
        symbols,
        lookbackDays: parseInt(options.lookback as string),
        usStrategy: (options.usStrategy as string) || 'enhanced-ma',
        cryptoStrategy: (options.cryptoStrategy as string) || 'bb-squeeze',
        krxStrategy: (options.krxStrategy as string) || 'bb-squeeze',
        useSPYFilter: options.spyFilter === true,
        symbolMaFilter: options.symbolMaFilter === true,
        symbolMaPeriod: parseInt(options.symbolMaPeriod as string),
        shortMa: parseInt(options.shortMa as string),
        longMa: parseInt(options.longMa as string),
        atrMultiplier: parseFloat(options.atrMultiplier as string),
        slopePeriod: parseInt(options.slopePeriod as string),
        ma200Period: parseInt((options['ma200Period'] ?? '200') as string),
        bbPeriod: parseInt(options.bbPeriod as string),
        bbStdDev: parseFloat(options.bbStddev as string),
        keltnerMultiplier: parseFloat(options.keltnerMultiplier as string),
        dryRun: options.dryRun !== false,
      });
    } catch (error) {
      logger.error('포트폴리오 신호 생성 실패', { error });
      console.error(`❌ 포트폴리오 신호 생성 실패: ${error}`);
      process.exit(1);
    }
  });

// CLI 실행
program.parse();
