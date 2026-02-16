#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger } from '@workspace/shared-utils';
import { runBacktest } from './engine/backtest.js';
import { runWalkForward } from './engine/walk-forward.js';
import { generateBacktestReport, generateWalkForwardReport, validatePerformance } from './reports/reporter.js';
import { SimpleMAStrategy } from './strategies/simple-ma-crossover.js';
import { SLIPPAGE_PRESETS } from './models/slippage.js';
import type { BacktestConfig, WalkForwardConfig } from './types.js';

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
  .option('--strategy <name>', '전략 (simple-ma)', 'simple-ma')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .action(async (options) => {
    try {
      logger.info('백테스트 시작', options);

      // 전략 생성
      const strategy = createStrategy(options.strategy, {
        shortPeriod: parseInt(options.shortMa),
        longPeriod: parseInt(options.longMa),
      });

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
        slippage: {
          model: slippagePreset.model,
          orderSize: new Big(0), // 런타임에 계산
          avgVolume: new Big(0), // 런타임에 계산
          bidAskSpread: new Big(0), // 런타임에 계산
          fixedPct: slippagePreset.fixedPct,
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
      } else {
        console.log('✅ 성과 검증 통과!');
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
  .option('--strategy <name>', '전략 (simple-ma)', 'simple-ma')
  .option('--short-ma <period>', '단기 이평선 기간', '10')
  .option('--long-ma <period>', '장기 이평선 기간', '20')
  .option('--in-sample <days>', 'In-Sample 기간 (일)', '180')
  .option('--out-sample <days>', 'Out-of-Sample 기간 (일)', '60')
  .option('--step <days>', '이동 간격 (일)', '30')
  .action(async (options) => {
    try {
      logger.info('Walk-Forward 분석 시작', options);

      // 전략 생성
      const strategy = createStrategy(options.strategy, {
        shortPeriod: parseInt(options.shortMa),
        longPeriod: parseInt(options.longMa),
      });

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
        slippage: {
          model: slippagePreset.model,
          orderSize: new Big(0),
          avgVolume: new Big(0),
          bidAskSpread: new Big(0),
          fixedPct: slippagePreset.fixedPct,
        },
      };

      // Walk-Forward 설정
      const wfConfig: WalkForwardConfig = {
        inSampleDays: parseInt(options.inSample),
        outSampleDays: parseInt(options.outSample),
        stepDays: parseInt(options.step),
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
      } else {
        console.log('✅ Out-of-Sample 성과 검증 통과!');
      }
    } catch (error) {
      logger.error('Walk-Forward 분석 실패', { error });
      console.error(`❌ Walk-Forward 분석 실패: ${error}`);
      process.exit(1);
    }
  });

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

// CLI 실행
program.parse();
