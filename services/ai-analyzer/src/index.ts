import { Market } from './config/markets';
import { getMarketMode } from './config/schedule';
import { runAiAnalysis } from './analysis/runAiAnalysis';
import { env } from './config/env';

async function main() {
  const markets: Market[] = [];

  if (env.AI_ENABLE_KR) markets.push(Market.KR);
  if (env.AI_ENABLE_US) markets.push(Market.US);
  if (env.AI_ENABLE_CRYPTO) markets.push(Market.CRYPTO);

  if (markets.length === 0) {
    console.log('[AI] 실행할 시장이 없습니다. (AI_ENABLE_KR/US/CRYPTO가 모두 false)');
    return;
  }

  for (const market of markets) {
    const mode = getMarketMode(market);
    await runAiAnalysis(market, mode);
  }
}

main().catch((e) => {
  console.error('[AI] 치명적 오류:', e);
  process.exitCode = 1;
});
