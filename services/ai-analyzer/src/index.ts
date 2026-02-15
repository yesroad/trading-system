import { Market } from './config/markets.js';
import { getMarketMode } from './config/schedule.js';
import { runAiAnalysis } from './analysis/runAiAnalysis.js';
import { env } from './config/env.js';
import type { MarketMode } from './config/schedule.js';

function shouldRunBySession(mode: MarketMode): boolean {
  if (env.AI_RUN_MODE === 'NO_CHECK') return true;
  if (env.AI_RUN_MODE === 'EXTENDED') {
    return (
      mode === 'PRE_OPEN' ||
      mode === 'INTRADAY' ||
      mode === 'CLOSE' ||
      mode === 'POST_CLOSE' ||
      mode === 'CRYPTO'
    );
  }
  if (env.AI_RUN_MODE === 'PREMARKET') return mode === 'PRE_OPEN';
  if (env.AI_RUN_MODE === 'AFTERMARKET') return mode === 'POST_CLOSE';
  return mode === 'INTRADAY' || mode === 'CLOSE' || mode === 'CRYPTO';
}

async function main() {
  const markets: Market[] = [];

  if (env.AI_ENABLE_KR) markets.push(Market.KRX);
  if (env.AI_ENABLE_US) markets.push(Market.US);
  if (env.AI_ENABLE_CRYPTO) markets.push(Market.CRYPTO);

  if (markets.length === 0) {
    console.log('[AI] 실행할 시장이 없습니다. (AI_ENABLE_KR/US/CRYPTO가 모두 false)');
    return;
  }

  for (const market of markets) {
    const mode = getMarketMode(market);
    if (!shouldRunBySession(mode)) {
      console.log(`[AI] 세션 외 스킵 | runMode=${env.AI_RUN_MODE} | market=${market} | mode=${mode}`);
      continue;
    }
    await runAiAnalysis(market, mode);
  }
}

main().catch((e) => {
  console.error('[AI] 치명적 오류:', e);
  process.exitCode = 1;
});
