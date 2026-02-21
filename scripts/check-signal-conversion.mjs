#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import '@workspace/shared-utils/env-loader';
import { envNumber, requireEnv } from '@workspace/shared-utils';
import { DateTime } from 'luxon';

function parseLookbackMinutes(raw) {
  if (!raw) return 60;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`lookback minutes must be positive number, got: ${raw}`);
  }
  return Math.floor(parsed);
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function countByMarketDecision(rows) {
  const out = {};
  for (const row of rows) {
    const market = String(row.market ?? 'UNKNOWN');
    const decision = String(row.decision ?? 'UNKNOWN');
    if (!out[market]) out[market] = {};
    out[market][decision] = (out[market][decision] ?? 0) + 1;
  }
  return out;
}

async function fetchPaged(from, baseQuery) {
  const pageSize = 1000;
  const all = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await baseQuery(from).range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function main() {
  const lookbackMinutes = parseLookbackMinutes(process.argv[2]);
  const now = DateTime.now().toUTC();
  const from = now.minus({ minutes: lookbackMinutes });

  const fromIso = from.toISO();
  const toIso = now.toISO();
  if (!fromIso || !toIso) {
    throw new Error('failed to build ISO window');
  }

  const supabaseUrl = requireEnv('SUPABASE_URL');
  const supabaseKey = requireEnv('SUPABASE_KEY');
  const minConfidence = envNumber('MIN_CONFIDENCE', 0.6) ?? 0.6;

  const sb = createClient(supabaseUrl, supabaseKey);

  const aiRows = await fetchPaged(sb, (client) =>
    client
      .from('ai_analysis_results')
      .select('id, market, decision, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
  );

  const signalRows = await fetchPaged(sb, (client) =>
    client
      .from('trading_signals')
      .select('id, ai_analysis_id, market, signal_type, confidence, created_at, consumed_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
  );

  const failureRows = await fetchPaged(sb, (client) =>
    client
      .from('signal_generation_failures')
      .select('id, ai_analysis_id, market, symbol, failure_type, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
  );

  const tradeRows = await fetchPaged(sb, (client) =>
    client
      .from('trades')
      .select('id, market, side, status, created_at')
      .gte('created_at', fromIso)
      .lte('created_at', toIso)
      .order('created_at', { ascending: false }),
  );

  const tradeableAiRows = aiRows.filter((row) => row.decision === 'BUY' || row.decision === 'SELL');
  const tradeableAiIds = new Set(tradeableAiRows.map((row) => String(row.id)));

  const signalsFromAiRows = signalRows.filter((row) => {
    const id = row.ai_analysis_id;
    return id !== null && tradeableAiIds.has(String(id));
  });

  const failedAiIds = new Set(
    failureRows
      .map((row) => row.ai_analysis_id)
      .filter((id) => id !== null)
      .map((id) => String(id)),
  );

  const conversionRate =
    tradeableAiRows.length === 0
      ? null
      : Number(((signalsFromAiRows.length / tradeableAiRows.length) * 100).toFixed(2));

  const executableSignals = signalRows.filter(
    (row) => row.signal_type === 'BUY' || row.signal_type === 'SELL',
  );
  const signalsPassingExecutorGate = executableSignals.filter((row) => {
    const confidence = Number(row.confidence);
    return Number.isFinite(confidence) && confidence >= minConfidence;
  });
  const confidenceFiltered = Math.max(
    0,
    executableSignals.length - signalsPassingExecutorGate.length,
  );

  const filledTrades = tradeRows.filter(
    (row) => String(row.status ?? '').toLowerCase() === 'filled',
  );

  const summary = {
    window: {
      lookbackMinutes,
      fromUtc: fromIso,
      toUtc: toIso,
      fromKst: from.setZone('Asia/Seoul').toISO(),
      toKst: now.setZone('Asia/Seoul').toISO(),
    },
    ai: {
      total: aiRows.length,
      byDecision: countBy(aiRows, (row) => String(row.decision ?? 'UNKNOWN')),
      byMarketDecision: countByMarketDecision(aiRows),
      tradeableTotal: tradeableAiRows.length,
      tradeableByMarket: countBy(tradeableAiRows, (row) => String(row.market ?? 'UNKNOWN')),
    },
    signals: {
      totalCreatedInWindow: signalRows.length,
      fromRecentTradeableAi: signalsFromAiRows.length,
      bySignalType: countBy(signalRows, (row) => String(row.signal_type ?? 'UNKNOWN')),
      unconsumed: signalRows.filter((row) => row.consumed_at === null).length,
      withoutAiAnalysisId: signalRows.filter((row) => row.ai_analysis_id === null).length,
    },
    executorGate: {
      minConfidence,
      executableSignals: executableSignals.length,
      passedByConfidence: signalsPassingExecutorGate.length,
      filteredByConfidence: confidenceFiltered,
      passRatioPct:
        executableSignals.length > 0
          ? Number(
              ((signalsPassingExecutorGate.length / executableSignals.length) * 100).toFixed(2),
            )
          : null,
    },
    failures: {
      totalCreatedInWindow: failureRows.length,
      byType: countBy(failureRows, (row) => String(row.failure_type ?? 'UNKNOWN')),
      uniqueAiAnalysisIds: failedAiIds.size,
    },
    conversion: {
      tradeableAiToSignalPct: conversionRate,
      generated: signalsFromAiRows.length,
      baseTradeableAi: tradeableAiRows.length,
      skippedTradeableAi: Math.max(0, tradeableAiRows.length - signalsFromAiRows.length),
    },
    executions: {
      tradesTotal: tradeRows.length,
      tradesFilled: filledTrades.length,
      filledByMarket: countBy(filledTrades, (row) => String(row.market ?? 'UNKNOWN')),
      filledBySide: countBy(filledTrades, (row) => String(row.side ?? 'UNKNOWN')),
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  if (error instanceof Error) {
    const cause = error.cause instanceof Error ? ` | cause=${error.cause.message}` : '';
    console.error(`[check-signal-conversion] ${error.name}: ${error.message}${cause}`);
    if (error.stack) {
      console.error(error.stack);
    }
  } else {
    console.error(`[check-signal-conversion] ${String(error)}`);
  }
  process.exit(1);
});
