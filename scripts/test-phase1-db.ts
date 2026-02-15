#!/usr/bin/env node
/**
 * Phase 1 DB Schema Verification Test
 * Tests all 5 new tables with basic CRUD operations
 */

import {
  insertTradingSignal,
  getUnconsumedSignals,
  markSignalConsumed,
  logRiskEvent,
  getRecentRiskEvents,
  createACELog,
  updateACEOutcome,
  getACELogsBySymbol,
  upsertMarketBreadth,
  getLatestMarketBreadth,
  insertNewsEvent,
  getHighImpactNews,
} from '@workspace/db-client';

async function testTradingSignals() {
  console.log('\n📊 Testing trading_signals table...');

  try {
    // Insert a test signal
    const signalId = await insertTradingSignal({
      symbol: 'BTC',
      market: 'KRW',
      broker: 'UPBIT',
      signal_type: 'BUY',
      entry_price: '93000',
      target_price: '98000',
      stop_loss: '91500',
      confidence: 0.85,
      reason: 'Test signal - Phase 1 verification',
      indicators: {
        rsi: 65,
        macd: { signal: 'bullish' },
      },
    });

    console.log(`  ✅ Signal created: ${signalId}`);

    // Fetch unconsumed signals
    const signals = await getUnconsumedSignals({ market: 'KRW', minConfidence: 0.7 });
    console.log(`  ✅ Unconsumed signals: ${signals.length}`);

    // Mark as consumed
    await markSignalConsumed(signalId);
    console.log(`  ✅ Signal marked as consumed`);

    // Verify consumed
    const unconsumedAfter = await getUnconsumedSignals({ market: 'KRW' });
    console.log(`  ✅ Unconsumed after marking: ${unconsumedAfter.length}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function testRiskEvents() {
  console.log('\n🚨 Testing risk_events table...');

  try {
    // Log a test risk event
    await logRiskEvent({
      event_type: 'leverage_violation',
      violation_type: 'max_leverage_exceeded',
      symbol: 'BTC',
      violation_details: {
        requested: 2.0,
        limit: 1.5,
        action: 'rejected',
      },
      severity: 'medium',
    });

    console.log(`  ✅ Risk event logged`);

    // Fetch recent events
    const events = await getRecentRiskEvents({ eventType: 'leverage_violation' });
    console.log(`  ✅ Recent risk events: ${events.length}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function testACELogs() {
  console.log('\n📋 Testing ace_logs table...');

  try {
    // Create an ACE log
    const aceLogId = await createACELog({
      symbol: 'BTC',
      market: 'KRW',
      broker: 'UPBIT',
      aspiration: {
        strategy: 'Technical + AI signal',
        targetProfit: '5%',
        maxLoss: '2%',
      },
      capability: {
        signals: [{ type: 'technical', confidence: 0.85 }],
        riskAssessment: { approved: true },
      },
      execution: {
        decision: 'BUY',
        actualEntry: 93000,
        size: 0.1,
      },
    });

    console.log(`  ✅ ACE log created: ${aceLogId}`);

    // Update with outcome
    await updateACEOutcome(aceLogId, {
      exitPrice: 98000,
      realizedPnL: 500,
      pnLPct: 5.38,
      result: 'WIN',
    });

    console.log(`  ✅ ACE outcome updated`);

    // Fetch by symbol
    const aceLogs = await getACELogsBySymbol('BTC', 5);
    console.log(`  ✅ ACE logs for BTC: ${aceLogs.length}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function testMarketBreadth() {
  console.log('\n📈 Testing market_breadth table...');

  try {
    // Upsert market breadth
    await upsertMarketBreadth({
      market: 'KRX',
      breadth_index: 0.72,
      uptrend_ratio: 0.68,
      advance_decline_line: 1250,
      analysis_time: new Date().toISOString(),
    });

    console.log(`  ✅ Market breadth upserted`);

    // Fetch latest
    const latest = await getLatestMarketBreadth('KRX');
    console.log(`  ✅ Latest breadth index: ${latest?.breadth_index}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function testNewsEvents() {
  console.log('\n📰 Testing news_events table...');

  try {
    // Insert a news event
    const newsId = await insertNewsEvent({
      title: 'Test: Federal Reserve announces rate decision',
      source: 'Reuters',
      impact_score: 8.5,
      affected_symbols: ['SPY', 'QQQ', 'BTC'],
      affected_sectors: ['Technology', 'Finance'],
      event_time: new Date().toISOString(),
    });

    console.log(`  ✅ News event created: ${newsId}`);

    // Fetch high-impact news
    const news = await getHighImpactNews({ minImpactScore: 7, limit: 5 });
    console.log(`  ✅ High-impact news: ${news.length}`);

    return true;
  } catch (error) {
    console.error(`  ❌ Error:`, error);
    return false;
  }
}

async function main() {
  console.log('🚀 Phase 1 Database Schema Verification\n');
  console.log('Testing 5 new tables with CRUD operations...\n');

  const results = {
    trading_signals: await testTradingSignals(),
    risk_events: await testRiskEvents(),
    ace_logs: await testACELogs(),
    market_breadth: await testMarketBreadth(),
    news_events: await testNewsEvents(),
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Results Summary:');
  console.log('='.repeat(50));

  Object.entries(results).forEach(([table, passed]) => {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} - ${table}`);
  });

  const allPassed = Object.values(results).every((r) => r);

  if (allPassed) {
    console.log('\n🎉 All tests passed! Phase 1 DB schema is ready.\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check errors above.\n');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
