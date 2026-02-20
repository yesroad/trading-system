import { createLogger } from '@workspace/shared-utils';
import { loadCandles } from '../data/loader.js';
import { RegimeDetector } from '../models/regime-detector.js';
import { DateTime } from 'luxon';

const logger = createLogger('regime-detector-cli');

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

export interface DetectRegimeOptions {
  symbol: string;
  startDate: string;
  endDate: string;
  windowDays: number; // 국면 감지 윈도우 (기본: 30일 간격)
  sma50Period: number;
  sma200Period: number;
  adxPeriod: number;
}

/**
 * 시장 국면 감지 및 출력
 */
export async function detectRegime(options: DetectRegimeOptions): Promise<void> {
  const { symbol, startDate, endDate, windowDays, sma50Period, sma200Period, adxPeriod } = options;

  logger.info('시장 국면 감지 시작', {
    symbol,
    startDate,
    endDate,
    windowDays,
  });

  // 캔들 데이터 로드 (워밍업 기간 포함: 200일 추가)
  const warmupDays = 210;
  const loadStart = DateTime.fromISO(startDate)
    .minus({ days: warmupDays })
    .toISODate();

  if (!loadStart) {
    throw new Error('Invalid start date');
  }

  // 심볼로부터 소스 결정
  const source = determineSource(symbol);

  const candles = await loadCandles({
    symbol,
    startDate: loadStart,
    endDate,
    source,
  });

  logger.info('캔들 데이터 로드 완료', { count: candles.length });

  // Regime Detector 생성
  const detector = new RegimeDetector({
    sma50Period,
    sma200Period,
    adxPeriod,
  });

  // 윈도우별 국면 감지
  const results: Array<{
    date: string;
    regime: string;
    confidence: number;
    adx: number;
    strategy: string;
  }> = [];

  let current = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);

  while (current <= end) {
    const currentDate = current.toISODate();
    if (!currentDate) break;

    // 현재 날짜까지의 캔들 필터링
    const candlesUpTo = candles.filter((c) => c.candleTime <= currentDate);

    if (candlesUpTo.length >= sma200Period + adxPeriod * 2) {
      const result = detector.detectRegime(candlesUpTo);
      const strategy = detector.getRecommendedStrategy(result.regime);

      results.push({
        date: currentDate,
        regime: result.regime,
        confidence: result.confidence,
        adx: result.metrics.adx,
        strategy,
      });
    }

    // 다음 윈도우로 이동
    current = current.plus({ days: windowDays });
  }

  // 결과 출력
  console.log('\n============================================================');
  console.log('시장 국면 분석 결과');
  console.log('============================================================\n');
  console.log(`심볼: ${symbol}`);
  console.log(`기간: ${startDate} ~ ${endDate}`);
  console.log(`분석 간격: ${windowDays}일\n`);

  console.log('날짜       | 국면           | 신뢰도 | ADX  | 권장 전략');
  console.log('-----------|---------------|--------|------|-------------');

  for (const r of results) {
    const regimeStr = r.regime.padEnd(13);
    const confidenceStr = (r.confidence * 100).toFixed(1).padStart(5);
    const adxStr = r.adx.toFixed(1).padStart(4);

    console.log(`${r.date} | ${regimeStr} | ${confidenceStr}% | ${adxStr} | ${r.strategy}`);
  }

  // 통계
  const regimeCounts: Record<string, number> = {};
  results.forEach((r) => {
    regimeCounts[r.regime] = (regimeCounts[r.regime] || 0) + 1;
  });

  console.log('\n## 국면 분포');
  Object.entries(regimeCounts).forEach(([regime, count]) => {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${regime}: ${count}회 (${pct}%)`);
  });

  console.log('\n## 국면별 권장 전략');
  console.log('  TRENDING_UP    → enhanced-ma (추세 추종)');
  console.log('  TRENDING_DOWN  → none (거래 중단)');
  console.log('  SIDEWAYS       → bb-squeeze (변동성 돌파)');
  console.log('  WEAK_TREND     → bb-squeeze (불명확 추세)');

  console.log('\n============================================================\n');
}
