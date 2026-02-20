import { createLogger } from '@workspace/shared-utils';
import { DateTime } from 'luxon';
import * as fs from 'fs';
import * as path from 'path';
import Big from 'big.js';
import { runPortfolioWalkForward, resolveSymbol } from '../engine/portfolio-walk-forward.js';
import { RegimeAdaptiveStrategy } from '../strategies/regime-adaptive-strategy.js';
import { EnhancedMAStrategy } from '../strategies/enhanced-ma-strategy.js';
import { BBSqueezeStrategy } from '../strategies/bb-squeeze-strategy.js';
import { SimpleMAStrategy } from '../strategies/simple-ma-crossover.js';
import type { PortfolioWalkForwardResult } from '../engine/portfolio-walk-forward.js';
import type { Strategy } from '../types.js';

const logger = createLogger('portfolio-wf');

// ============================================================
// CLI 파라미터
// ============================================================

export interface PortfolioWFOptions {
  symbols: string[];           // 심볼 목록
  startDate: string;
  endDate: string;
  capital: number;
  commission: number;
  inSample: number;
  outSample: number;
  step: number;
  minOosTrades: number;
  maxPositions: number;        // 동시 최대 보유 종목
  useSPYFilter: boolean;       // SPY MA200 레짐 필터
  warmupDays: number;
  // 전략 파라미터 (전략 내부 로직 변경 없이 전달)
  shortMa: number;
  longMa: number;
  atrMultiplier: number;
  slopePeriod: number;
  use200MaFilter: boolean;
  ma200Period: number;
  bbPeriod: number;
  bbStdDev: number;
  keltnerMultiplier: number;
  minSymbolWindowRatio: number;  // 심볼별 최소 유효창 비율 (0=비활성)
  maxSymbolWeight: number;       // 심볼별 최대 비중 (0=무제한)
  slippageBps: number;           // 고정 슬리피지 bps (0=기본 프리셋)
  weighting: 'equal' | 'inv-vol'; // 가중치 모드
  volLookback: number;           // inv-vol 룩백 기간 (일)
  stressCompare: boolean;        // 0/30/50bp 공정 비교 모드
  rebalance: 'oos' | 'weekly' | 'monthly' | 'daily'; // 리밸런싱 주기
  ddReducePct: number;           // DD 감속 임계값 (%, 0=비활성)
  ddHaltPct: number;             // DD 중단 임계값 (%, 0=비활성)
  ddLookback: number;            // Rolling DD 룩백 창 수 (0=전체 누적)
  symbolMaFilter: boolean;       // 심볼별 MA 필터 활성화
  symbolMaPeriod: number;        // 심볼별 MA 기간 (기본 50)
  // 시장별 전략 선택
  usStrategy: string;            // 미장(yf) 전략 (기본: regime-adaptive)
  cryptoStrategy: string;        // 코인(upbit) 전략 (기본: regime-adaptive)
  krxStrategy: string;           // 국장(kis) 전략 (기본: regime-adaptive)
}

// ============================================================
// 진입점
// ============================================================

export async function runPortfolioWF(options: PortfolioWFOptions): Promise<void> {
  logger.info('포트폴리오 WF 시작', {
    symbols: options.symbols,
    startDate: options.startDate,
    endDate: options.endDate,
    inSample: options.inSample,
    outSample: options.outSample,
    step: options.step,
  });

  // --rebalance 옵션이 step을 override
  const effectiveStep =
    options.rebalance === 'weekly'  ? 7  :
    options.rebalance === 'daily'   ? 1  :
    options.rebalance === 'monthly' ? 30 :
    options.step;

  console.log('\n' + '='.repeat(60));
  console.log('포트폴리오 Walk-Forward 백테스트');
  console.log('='.repeat(60));
  console.log(`심볼: ${options.symbols.join(', ')}`);
  console.log(`기간: ${options.startDate} ~ ${options.endDate}`);
  console.log(`WF:   IS=${options.inSample}일 / OOS=${options.outSample}일 / Step=${effectiveStep}일${options.rebalance !== 'oos' ? ` (--rebalance ${options.rebalance})` : ''}`);
  console.log(`포트: 최대 ${options.maxPositions}종목 | 가중치=${options.weighting}${options.weighting === 'inv-vol' ? `(lookback=${options.volLookback}일)` : ''}`);
  console.log(`필터: SPY MA200=${options.useSPYFilter ? 'ON' : 'OFF'}`);
  if (options.maxSymbolWeight > 0) console.log(`심볼 최대 비중: ${(options.maxSymbolWeight * 100).toFixed(0)}%`);
  if (options.slippageBps > 0) console.log(`슬리피지: ${options.slippageBps}bp (Stress)`);
  if (options.ddReducePct > 0) console.log(`DD 감속: ${options.ddReducePct}% → 포지션 50%`);
  if (options.ddHaltPct > 0) console.log(`DD 중단: ${options.ddHaltPct}% → 현금 전환`);
  if (options.ddLookback > 0) console.log(`DD 룩백: 최근 ${options.ddLookback}창 (Rolling)`);
  if (options.symbolMaFilter) console.log(`심볼 MA 필터: MA${options.symbolMaPeriod} (하락 추세 심볼 제외)`);
  // 시장별 전략이 기본값과 다를 때만 출력
  const allSame = options.usStrategy === options.cryptoStrategy && options.cryptoStrategy === options.krxStrategy;
  if (allSame) {
    if (options.usStrategy !== 'regime-adaptive') console.log(`전략: ${options.usStrategy} (전체 공통)`);
  } else {
    console.log(`전략: 미장=${options.usStrategy} | 코인=${options.cryptoStrategy} | 국장=${options.krxStrategy}`);
  }
  if (options.stressCompare) console.log(`모드: Stress Fair Compare (0 / 30 / 50bp 동일창 비교)`);
  console.log('='.repeat(60) + '\n');

  // 전략명으로 전략 인스턴스를 생성하는 헬퍼
  const buildStrategyByName = (name: string): Strategy => {
    switch (name) {
      case 'enhanced-ma':
        return new EnhancedMAStrategy({
          shortPeriod: options.shortMa,
          longPeriod: options.longMa,
          atrMultiplier: options.atrMultiplier,
          slopePeriod: options.slopePeriod,
          use200MaFilter: options.use200MaFilter,
          ma200Period: options.ma200Period,
        });
      case 'bb-squeeze':
        return new BBSqueezeStrategy({
          bbPeriod: options.bbPeriod,
          bbStdDev: options.bbStdDev,
          keltnerMultiplier: options.keltnerMultiplier,
          atrStopMultiplier: options.atrMultiplier,
        });
      case 'simple-ma':
        return new SimpleMAStrategy({
          shortPeriod: options.shortMa,
          longPeriod: options.longMa,
        });
      case 'regime-adaptive':
      default:
        return new RegimeAdaptiveStrategy({
          sma50Period: 50,
          sma200Period: options.ma200Period,
          adxPeriod: 14,
          enhancedMa: {
            shortPeriod: options.shortMa,
            longPeriod: options.longMa,
            atrMultiplier: options.atrMultiplier,
            slopePeriod: options.slopePeriod,
            use200MaFilter: options.use200MaFilter,
            ma200Period: options.ma200Period,
          },
          bbSqueeze: {
            bbPeriod: options.bbPeriod,
            bbStdDev: options.bbStdDev,
            keltnerMultiplier: options.keltnerMultiplier,
            atrStopMultiplier: options.atrMultiplier,
          },
        });
    }
  };

  // 심볼별 전략 팩토리 — 시장 타입에 따라 다른 전략 선택
  const createStrategy = (symbol: string): Strategy => {
    const { source } = resolveSymbol(symbol);
    const stratName =
      source === 'upbit' ? options.cryptoStrategy :
      source === 'kis'   ? options.krxStrategy :
      options.usStrategy;
    return buildStrategyByName(stratName);
  };

  // 공통 WF 파라미터 빌더
  const buildWFParams = (slippageBps?: number) => ({
    symbolRaws: options.symbols,
    createStrategy,
    startDate: options.startDate,
    endDate: options.endDate,
    capital: new Big(options.capital),
    commission: options.commission,
    wfConfig: {
      inSampleDays: options.inSample,
      outSampleDays: options.outSample,
      stepDays: effectiveStep,
      minOosTrades: options.minOosTrades,
      warmupDays: options.warmupDays,
    },
    maxPositions: options.maxPositions,
    useSPYFilter: options.useSPYFilter,
    minOosTrades: options.minOosTrades,
    minSymbolWindowRatio: options.minSymbolWindowRatio,
    maxSymbolWeight: options.maxSymbolWeight > 0 ? options.maxSymbolWeight : undefined,
    slippageBps: slippageBps !== undefined ? (slippageBps > 0 ? slippageBps : undefined) : (options.slippageBps > 0 ? options.slippageBps : undefined),
    weightingMode: options.weighting,
    volLookback: options.volLookback,
    ddReducePct: options.ddReducePct > 0 ? options.ddReducePct : undefined,
    ddHaltPct: options.ddHaltPct > 0 ? options.ddHaltPct : undefined,
    ddLookback: options.ddLookback > 0 ? options.ddLookback : undefined,
    symbolMaFilter: options.symbolMaFilter || undefined,
    symbolMaPeriod: options.symbolMaFilter ? options.symbolMaPeriod : undefined,
  });

  const today = DateTime.now().toISODate() ?? '2026-02-20';
  fs.mkdirSync(path.resolve('reports'), { recursive: true });

  if (options.stressCompare) {
    // Stress Fair Compare 모드: 0 / 30 / 50bp 동일창 기준 비교
    console.log('🔄 [0bp] 기준선 실행...');
    const r0   = await runPortfolioWalkForward(buildWFParams(0));
    console.log('🔄 [30bp] Stress 실행...');
    const r30  = await runPortfolioWalkForward(buildWFParams(30));
    console.log('🔄 [50bp] Stress 실행...');
    const r50  = await runPortfolioWalkForward(buildWFParams(50));

    const stressReport = generateStressFairCompareReport(r0, r30, r50, options, effectiveStep);
    console.log(stressReport);

    const reportPath = path.resolve(`reports/portfolio_wf_stress_fair_compare_${today}.md`);
    fs.writeFileSync(reportPath, stressReport, 'utf-8');
    console.log(`\n📄 Stress 비교 리포트 저장: ${reportPath}`);
    return;
  }

  const result = await runPortfolioWalkForward(buildWFParams());

  // 콘솔 출력
  const report = generateConsoleReport(result, options, effectiveStep);
  console.log(report);

  // 파일 저장
  const reportPath = path.resolve(`reports/portfolio_walkforward_global_${today}.md`);
  const mdReport = generateMarkdownReport(result, options, effectiveStep);
  fs.writeFileSync(reportPath, mdReport, 'utf-8');
  console.log(`\n📄 리포트 저장: ${reportPath}`);
}

// ============================================================
// 콘솔 리포트
// ============================================================

function generateConsoleReport(
  result: PortfolioWalkForwardResult,
  options: PortfolioWFOptions,
  effectiveStep: number,
): string {
  const { aggregated, windows, symbolContributions } = result;
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('포트폴리오 OOS 결과');
  lines.push('='.repeat(60));

  // 집계 지표
  lines.push('\n## 포트폴리오 집계 지표');
  lines.push(`OOS Consistency: ${aggregated.oosConsistencyPass ? '✅ PASS' : '❌ FAIL'}`);
  lines.push(`  Positive Windows: ${aggregated.positiveWindowCount}/${aggregated.totalValidWindows} (${(aggregated.positiveRatio * 100).toFixed(1)}%) [기준: ≥40%]`);
  lines.push(`  Median OOS Return: ${aggregated.medianOosReturn.toFixed(2)}% [기준: ≥0%]`);
  lines.push(`  Avg OOS Return:    ${aggregated.avgOosReturn.toFixed(2)}%`);
  lines.push(`  Sharpe 추정:       ${aggregated.sharpeEstimate.toFixed(2)}`);
  lines.push(`  Max Drawdown:      ${aggregated.maxDrawdown.toFixed(2)}%`);

  // 윈도우별 OOS 테이블
  lines.push('\n## 윈도우별 OOS 결과');
  lines.push('창# | OOS 기간                    | 포트 수익률 | 활성 종목 | 거래수 | 상태');
  lines.push('-'.repeat(90));

  for (const w of windows) {
    const statusLabel =
      w.status === 'spy_blocked'        ? '🔒SPY' :
      w.status === 'insufficient_trades'? '⚠️부족' :
      w.status === 'dd_halted'          ? '🛑DD중단' :
      w.status === 'dd_reduced'         ? `⬇️DD감속(${w.positionScalar * 100}%)` : '✓';
    const activeStr = w.activeSymbols.slice(0, 3).join(',') + (w.activeSymbols.length > 3 ? '...' : '');
    lines.push(
      `${String(w.windowIndex + 1).padStart(2)} | ` +
      `${w.outSampleStart} ~ ${w.outSampleEnd} | ` +
      `${w.portfolioReturn >= 0 ? '+' : ''}${w.portfolioReturn.toFixed(2)}%`.padStart(8) + '   | ' +
      `${activeStr}`.padEnd(18) + '| ' +
      `${String(w.totalOosTrades).padStart(4)}   | ` +
      statusLabel
    );
  }

  // 심볼별 기여도 Top 3
  lines.push('\n## 상위 기여 종목 Top 3');
  lines.push('순위 | 심볼      | 평균 OOS 수익률 | 유효 창수');
  lines.push('-'.repeat(50));
  symbolContributions.slice(0, 3).forEach((c, i) => {
    lines.push(
      `${i + 1}    | ` +
      `${c.symbol.padEnd(9)} | ` +
      `${c.avgReturn >= 0 ? '+' : ''}${c.avgReturn.toFixed(2)}%`.padStart(10) + '      | ' +
      `${c.validWindows}창`
    );
  });

  // 사용된 CLI 커맨드
  lines.push('\n## 사용된 CLI 커맨드');
  const resolvedSymbols = options.symbols.map((s) => resolveSymbol(s).symbol);
  lines.push('```bash');
  lines.push(`node dist/cli.js portfolio-wf \\`);
  lines.push(`  --symbols "${resolvedSymbols.join(',')}" \\`);
  lines.push(`  --start ${options.startDate} --end ${options.endDate} \\`);
  lines.push(`  --in-sample ${options.inSample} --out-sample ${options.outSample} --step ${effectiveStep} \\`);
  lines.push(`  --max-positions ${options.maxPositions} \\`);
  lines.push(`  --min-oos-trades ${options.minOosTrades} \\`);
  if (options.useSPYFilter) lines.push(`  --spy-filter \\`);
  if (options.use200MaFilter) lines.push(`  --use-200ma-filter \\`);
  if (options.maxSymbolWeight > 0) lines.push(`  --max-symbol-weight ${options.maxSymbolWeight} \\`);
  if (options.slippageBps > 0) lines.push(`  --slippage-bps ${options.slippageBps} \\`);
  if (options.weighting !== 'equal') lines.push(`  --weighting ${options.weighting} --vol-lookback ${options.volLookback} \\`);
  if (options.rebalance !== 'oos') lines.push(`  --rebalance ${options.rebalance} \\`);
  lines.push(`  --warmup 210`);
  lines.push('```');

  return lines.join('\n');
}

// ============================================================
// 마크다운 리포트
// ============================================================

function generateMarkdownReport(
  result: PortfolioWalkForwardResult,
  options: PortfolioWFOptions,
  effectiveStep: number,
): string {
  const { aggregated, windows, symbolContributions } = result;
  const today = DateTime.now().toISODate() ?? '2026-02-19';
  const resolvedSymbols = options.symbols.map((s) => resolveSymbol(s).symbol);

  const lines: string[] = [];

  lines.push(`# Regime-Adaptive 글로벌 포트폴리오 Walk-Forward 결과`);
  lines.push(`**생성일:** ${today}`);
  lines.push('');
  lines.push('## 개요');
  lines.push('');
  lines.push('| 항목 | 값 |');
  lines.push('|------|-----|');
  lines.push(`| 전략 | ${result.strategyName} |`);
  lines.push(`| 유니버스 | ${resolvedSymbols.join(', ')} |`);
  lines.push(`| 검증 기간 | ${result.startDate} ~ ${result.endDate} |`);
  lines.push(`| WF 설정 | IS=${result.wfConfig.inSampleDays}일 / OOS=${result.wfConfig.outSampleDays}일 / Step=${result.wfConfig.stepDays}일 |`);
  lines.push(`| 최대 보유 종목 | ${options.maxPositions}종목 (동일비중) |`);
  lines.push(`| SPY 레짐 필터 | ${options.useSPYFilter ? '활성화 (SPY OOS -3% 이하 → 현금)' : '비활성화'} |`);
  lines.push(`| 심볼 최대 비중 | ${options.maxSymbolWeight > 0 ? `${(options.maxSymbolWeight * 100).toFixed(0)}%` : '무제한'} |`);
  lines.push(`| 슬리피지 | ${options.slippageBps > 0 ? `${options.slippageBps}bp (Fixed Stress)` : '기본 프리셋'} |`);
  lines.push(`| 리밸런싱 | OOS 창 단위 (약 ${result.wfConfig.outSampleDays}일) |`);
  lines.push('');

  // OOS Consistency
  lines.push('## OOS Consistency 결과');
  lines.push('');
  const passIcon = aggregated.oosConsistencyPass ? '✅' : '❌';
  lines.push(`### ${passIcon} ${aggregated.oosConsistencyPass ? 'PASS' : 'FAIL'}`);
  lines.push('');
  lines.push('| 지표 | 결과 | 기준 | 판정 |');
  lines.push('|------|------|------|------|');
  lines.push(
    `| Positive Windows | ${aggregated.positiveWindowCount}/${aggregated.totalValidWindows} (${(aggregated.positiveRatio * 100).toFixed(1)}%) | ≥ 40% | ${aggregated.positiveRatio >= 0.4 ? '✅' : '❌'} |`
  );
  lines.push(
    `| Median OOS Return | ${aggregated.medianOosReturn.toFixed(2)}% | ≥ 0% | ${aggregated.medianOosReturn >= 0 ? '✅' : '❌'} |`
  );
  lines.push('');
  lines.push('| 추가 지표 | 값 |');
  lines.push('|-----------|-----|');
  lines.push(`| Avg OOS Return | ${aggregated.avgOosReturn.toFixed(2)}% |`);
  lines.push(`| Sharpe 추정 | ${aggregated.sharpeEstimate.toFixed(2)} |`);
  lines.push(`| Max Drawdown (누적) | ${aggregated.maxDrawdown.toFixed(2)}% |`);
  lines.push(`| 유효 창 수 | ${aggregated.totalValidWindows}개 |`);
  lines.push(`| SPY 차단 창 수 | ${windows.filter((w) => w.spyFilterApplied).length}개 |`);
  lines.push('');

  // 윈도우별 테이블
  lines.push('## 윈도우별 OOS 결과');
  lines.push('');
  lines.push('| 창 | OOS 시작 | OOS 종료 | 포트 수익률 | 활성 종목 | 거래수 | 상태 |');
  lines.push('|----|----------|----------|------------|----------|--------|------|');
  for (const w of windows) {
    const statusLabel =
      w.status === 'spy_blocked'         ? '🔒 SPY 차단' :
      w.status === 'insufficient_trades' ? '⚠️ 거래부족' :
      w.status === 'dd_halted'           ? '🛑 DD 중단' :
      w.status === 'dd_reduced'          ? `⬇️ DD 감속 (${(w.positionScalar * 100).toFixed(0)}%)` :
      '✓ 유효';
    const retStr = `${w.portfolioReturn >= 0 ? '+' : ''}${w.portfolioReturn.toFixed(2)}%`;
    lines.push(
      `| ${w.windowIndex + 1} | ${w.outSampleStart} | ${w.outSampleEnd} | **${retStr}** | ${w.activeSymbols.join(', ')} | ${w.totalOosTrades} | ${statusLabel} |`
    );
  }
  lines.push('');

  // 심볼별 OOS 수익률 매트릭스
  lines.push('## 심볼별 OOS 수익률 매트릭스');
  lines.push('');
  const header = ['창', ...resolvedSymbols, '포트 합계'];
  lines.push(`| ${header.join(' | ')} |`);
  lines.push(`| ${header.map(() => '------').join(' | ')} |`);
  for (const w of windows) {
    const row = [String(w.windowIndex + 1)];
    for (const sym of resolvedSymbols) {
      const ret = w.symbolReturns[sym];
      row.push(ret !== null && ret !== undefined ? `${ret >= 0 ? '+' : ''}${ret.toFixed(2)}%` : '-');
    }
    row.push(`${w.portfolioReturn >= 0 ? '+' : ''}${w.portfolioReturn.toFixed(2)}%`);
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');

  // 상위 기여 종목
  lines.push('## 심볼별 기여도');
  lines.push('');
  lines.push('| 순위 | 심볼 | 평균 OOS 수익률 | 유효 창수 |');
  lines.push('|------|------|----------------|----------|');
  symbolContributions.forEach((c, i) => {
    const retStr = `${c.avgReturn >= 0 ? '+' : ''}${c.avgReturn.toFixed(2)}%`;
    lines.push(`| ${i + 1} | ${c.symbol} | ${retStr} | ${c.validWindows}창 |`);
  });
  lines.push('');

  // 해석
  lines.push('## 결과 해석');
  lines.push('');
  if (aggregated.oosConsistencyPass) {
    lines.push('**포트폴리오 단위 OOS Consistency PASS**: 글로벌 포트폴리오 구성이 단일 종목 대비 유효한 수익 구조를 보입니다.');
    lines.push('');
    lines.push('- 다변화 효과가 존재하며, 상관관계가 낮은 자산군 조합이 효과적');
    lines.push('- 리밸런싱 주기 내 동일비중 유지가 드로다운을 억제');
    const top3 = symbolContributions.slice(0, 3);
    lines.push(`- Top 기여 종목: ${top3.map((c) => `${c.symbol}(${c.avgReturn >= 0 ? '+' : ''}${c.avgReturn.toFixed(2)}%)`).join(', ')}`);
  } else {
    lines.push('**포트폴리오 단위 OOS Consistency FAIL**: 현재 설정으로는 포트폴리오 수익 구조가 입증되지 않습니다.');
    lines.push('');
    lines.push('### 실패 원인 분석');
    if (aggregated.positiveRatio < 0.4) {
      lines.push(`- Positive Windows ${(aggregated.positiveRatio * 100).toFixed(1)}% < 40% → 하락 창이 다수`);
    }
    if (aggregated.medianOosReturn < 0) {
      lines.push(`- Median OOS Return ${aggregated.medianOosReturn.toFixed(2)}% < 0% → 중앙값 손실`);
    }
    lines.push('');
    lines.push('### 개선 방향');
    lines.push('1. 유니버스 확대: 섹터 분산 (헬스케어, 에너지 추가)');
    lines.push('2. 검증 기간 연장: 2020년 이후 불마켓 포함');
    lines.push('3. 최대 보유 종목 조정 (3개로 축소 시 집중도 증가)');
    lines.push('4. Regime 분류 정교화 (현재 OOS 수익률 대리 측정 → 실제 MA200 비교로 개선)');
  }
  lines.push('');

  // 사용된 CLI 커맨드
  lines.push('## 사용된 CLI 커맨드');
  lines.push('');
  lines.push('```bash');
  lines.push(`node dist/cli.js portfolio-wf \\`);
  lines.push(`  --symbols "${resolvedSymbols.join(',')}" \\`);
  lines.push(`  --start ${options.startDate} --end ${options.endDate} \\`);
  lines.push(`  --in-sample ${options.inSample} --out-sample ${options.outSample} --step ${effectiveStep} \\`);
  lines.push(`  --max-positions ${options.maxPositions} \\`);
  lines.push(`  --min-oos-trades ${options.minOosTrades} \\`);
  if (options.useSPYFilter) lines.push(`  --spy-filter \\`);
  if (options.use200MaFilter) lines.push(`  --use-200ma-filter \\`);
  if (options.maxSymbolWeight > 0) lines.push(`  --max-symbol-weight ${options.maxSymbolWeight} \\`);
  if (options.slippageBps > 0) lines.push(`  --slippage-bps ${options.slippageBps} \\`);
  if (options.weighting !== 'equal') lines.push(`  --weighting ${options.weighting} --vol-lookback ${options.volLookback} \\`);
  if (options.rebalance !== 'oos') lines.push(`  --rebalance ${options.rebalance} \\`);
  lines.push(`  --warmup 210`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// Stress Fair Compare 리포트 (Task A)
// ============================================================

function generateStressFairCompareReport(
  r0: PortfolioWalkForwardResult,
  r30: PortfolioWalkForwardResult,
  r50: PortfolioWalkForwardResult,
  options: PortfolioWFOptions,
  effectiveStep: number,
): string {
  const today = DateTime.now().toISODate() ?? '2026-02-20';
  const resolvedSymbols = options.symbols.map((s) => resolveSymbol(s).symbol);
  const lines: string[] = [];

  lines.push('# Stress Fair Compare — 동일 30창 기준 슬리피지 시나리오 비교');
  lines.push(`**생성일:** ${today}`);
  lines.push('');
  lines.push('## 설정');
  lines.push('');
  lines.push('| 항목 | 값 |');
  lines.push('|------|-----|');
  lines.push(`| 심볼 | ${resolvedSymbols.join(', ')} |`);
  lines.push(`| 기간 | ${r0.startDate} ~ ${r0.endDate} |`);
  lines.push(`| WF | IS=${r0.wfConfig.inSampleDays}일 / OOS=${r0.wfConfig.outSampleDays}일 / Step=${effectiveStep}일 |`);
  lines.push(`| 포트 | 최대 ${options.maxPositions}종목 | 가중치=${options.weighting} |`);
  lines.push(`| 종목 선택 기준 | IS 수익률 (Lookahead Bias 제거) |`);
  lines.push('');

  // 집계 지표 비교
  lines.push('## 집계 지표 비교 (동일 30창 기준)');
  lines.push('');
  lines.push('| 지표 | 기준 0bp | Stress 30bp | Stress 50bp |');
  lines.push('|------|----------|-------------|-------------|');

  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
  const passIcon = (r: PortfolioWalkForwardResult) =>
    r.aggregated.oosConsistencyPass ? '✅ PASS' : '❌ FAIL';
  const pwFmt = (r: PortfolioWalkForwardResult) =>
    `${r.aggregated.positiveWindowCount}/${r.aggregated.totalValidWindows} (${(r.aggregated.positiveRatio * 100).toFixed(1)}%)`;

  lines.push(`| OOS Consistency | ${passIcon(r0)} | ${passIcon(r30)} | ${passIcon(r50)} |`);
  lines.push(`| Positive Windows | ${pwFmt(r0)} | ${pwFmt(r30)} | ${pwFmt(r50)} |`);
  lines.push(`| Median OOS Return | ${fmt(r0.aggregated.medianOosReturn)} | ${fmt(r30.aggregated.medianOosReturn)} | ${fmt(r50.aggregated.medianOosReturn)} |`);
  lines.push(`| Avg OOS Return | ${fmt(r0.aggregated.avgOosReturn)} | ${fmt(r30.aggregated.avgOosReturn)} | ${fmt(r50.aggregated.avgOosReturn)} |`);
  lines.push(`| Sharpe 추정 | ${r0.aggregated.sharpeEstimate.toFixed(2)} | ${r30.aggregated.sharpeEstimate.toFixed(2)} | ${r50.aggregated.sharpeEstimate.toFixed(2)} |`);
  lines.push(`| Max Drawdown | ${fmt(r0.aggregated.maxDrawdown)} | ${fmt(r30.aggregated.maxDrawdown)} | ${fmt(r50.aggregated.maxDrawdown)} |`);
  lines.push(`| 유효 창 수 | ${r0.aggregated.totalValidWindows} | ${r30.aggregated.totalValidWindows} | ${r50.aggregated.totalValidWindows} |`);
  lines.push('');

  // 창별 비교
  lines.push('## 창별 수익률 비교 (동일 30창 기준)');
  lines.push('');
  lines.push('> ⚠️INSUF = 거래 부족 (Selection Bias 원인), 🔒SPY = SPY 레짐 차단');
  lines.push('');
  lines.push('| 창 | OOS 시작 | OOS 종료 | 0bp | 30bp | 50bp | 비고 |');
  lines.push('|----|----------|----------|-----|------|------|------|');

  for (const w0 of r0.windows) {
    const key = w0.outSampleStart;
    const w30 = r30.windows.find((w) => w.outSampleStart === key);
    const w50 = r50.windows.find((w) => w.outSampleStart === key);

    const retStr = (w: typeof w0 | undefined) => {
      if (!w) return 'N/A';
      if (w.status === 'insufficient_trades') return '⚠️INSUF';
      if (w.status === 'spy_blocked') return '🔒SPY';
      return `${w.portfolioReturn >= 0 ? '+' : ''}${w.portfolioReturn.toFixed(2)}%`;
    };

    const hasDrop =
      w0.status === 'valid' &&
      (w30?.status !== 'valid' || w50?.status !== 'valid');
    const note = hasDrop ? '⚠️ 창 탈락' : '';

    lines.push(
      `| ${w0.windowIndex + 1} | ${w0.outSampleStart} | ${w0.outSampleEnd} | ${retStr(w0)} | ${retStr(w30)} | ${retStr(w50)} | ${note} |`
    );
  }
  lines.push('');

  // 탈락 창 분석
  const dropped30 = r0.windows.filter((w) => {
    const m = r30.windows.find((x) => x.outSampleStart === w.outSampleStart);
    return w.status === 'valid' && m?.status !== 'valid';
  });
  const dropped50 = r0.windows.filter((w) => {
    const m = r50.windows.find((x) => x.outSampleStart === w.outSampleStart);
    return w.status === 'valid' && m?.status !== 'valid';
  });

  if (dropped30.length > 0 || dropped50.length > 0) {
    lines.push('## 탈락 창 분석 (Selection Bias 원인)');
    lines.push('');
    if (dropped30.length > 0) {
      lines.push(`**30bp 탈락 창 ${dropped30.length}개:**`);
      for (const w of dropped30) {
        lines.push(`- 창 ${w.windowIndex + 1} (${w.outSampleStart}): 기준 ${fmt(w.portfolioReturn)} → 30bp 거래 부족`);
      }
      lines.push('');
    }
    if (dropped50.length > 0) {
      lines.push(`**50bp 탈락 창 ${dropped50.length}개:**`);
      for (const w of dropped50) {
        lines.push(`- 창 ${w.windowIndex + 1} (${w.outSampleStart}): 기준 ${fmt(w.portfolioReturn)} → 50bp 거래 부족`);
      }
      lines.push('');
    }
  }

  // 결론
  const pass30 = r30.aggregated.oosConsistencyPass;
  const pass50 = r50.aggregated.oosConsistencyPass;
  lines.push('## 결론: 실전 소액 테스트 조건 제안');
  lines.push('');
  if (pass30 && pass50) {
    lines.push('1. **권장 슬리피지 가정**: 30bp (편도). 50bp까지도 PASS이나 창 탈락 여부 확인 필수.');
  } else if (pass30) {
    lines.push('1. **권장 슬리피지 가정**: 30bp (편도). 50bp는 창 탈락으로 결과 신뢰도 낮음 — 실전 적용 시 주의.');
  } else {
    lines.push('1. **주의**: 30bp 이상에서 FAIL → 실전 비용 조건에서 전략 재검토 권장.');
  }
  lines.push(`2. **권장 비중**: 종목당 최대 ${options.maxSymbolWeight > 0 ? (options.maxSymbolWeight * 100).toFixed(0) + '%' : '동일비중'}. BTC 집중도 30% 초과 시 별도 모니터링.`);
  lines.push('3. **리스크 기준**: MDD 30% 초과 시 포지션 절반 감소, 50% 초과 시 전량 현금 전환 권장.');
  lines.push('');

  // CLI 커맨드
  lines.push('## 사용된 CLI 커맨드');
  lines.push('');
  lines.push('```bash');
  lines.push(`node dist/cli.js portfolio-wf \\`);
  lines.push(`  --symbols "${resolvedSymbols.join(',')}" \\`);
  lines.push(`  --start ${options.startDate} --end ${options.endDate} \\`);
  lines.push(`  --in-sample ${options.inSample} --out-sample ${options.outSample} --step ${effectiveStep} \\`);
  lines.push(`  --max-positions ${options.maxPositions} --min-oos-trades ${options.minOosTrades} \\`);
  if (options.useSPYFilter) lines.push(`  --spy-filter \\`);
  if (options.maxSymbolWeight > 0) lines.push(`  --max-symbol-weight ${options.maxSymbolWeight} \\`);
  if (options.weighting !== 'equal') lines.push(`  --weighting ${options.weighting} --vol-lookback ${options.volLookback} \\`);
  if (options.rebalance !== 'oos') lines.push(`  --rebalance ${options.rebalance} \\`);
  lines.push(`  --min-symbol-window-ratio 0.2 --warmup 210 \\`);
  lines.push(`  --stress-compare`);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}
