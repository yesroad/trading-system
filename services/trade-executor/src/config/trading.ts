import 'dotenv/config';
import { env, envBoolean, envNumber } from '@workspace/shared-utils';
import { EXECUTE_MARKETS } from './markets.js';

export type RunMode = 'MARKET_ONLY' | 'EXTENDED' | 'ALWAYS';

export type TradingConfig = {
  enabled: boolean;
  dryRun: boolean;
  tradeExecutorRunMode: RunMode;
  loopMode: boolean;
  loopIntervalMs: number;
  loopIntervalCryptoSec: number;
  loopIntervalUsSec: number;
  loopIntervalKrSec: number;
  maxCandidatesPerMarket: number;
  minConfidence: number;
  stopLossPct: number;
  takeProfitPct: number;
  maxDailyTrades: number;
  maxTradeNotional: number;
  enableMarketHoursGuard: boolean;
  autoDisableConsecutiveFailures: number;
  autoRecoveryCooldownMin: number;
  executeMarkets: readonly string[];
};

function parseRunMode(value: string | undefined): RunMode {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'ALWAYS') return 'ALWAYS';
  if (normalized === 'EXTENDED') return 'EXTENDED';
  if (normalized === 'MARKET_ONLY' || normalized === undefined || normalized === '') {
    return 'MARKET_ONLY';
  }
  throw new Error(`TRADE_EXECUTOR_RUN_MODE must be one of MARKET_ONLY|EXTENDED|ALWAYS, got: ${value}`);
}

function mustPositiveInt(name: string, value: number): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${value}`);
  }
  return value;
}

function mustRange(name: string, value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be between ${min} and ${max}, got: ${value}`);
  }
  return value;
}

const loopIntervalMs = envNumber('LOOP_INTERVAL_MS', 60_000) ?? 60_000;
const loopIntervalCryptoSec = envNumber('LOOP_INTERVAL_CRYPTO_SEC', 60) ?? 60;
const loopIntervalUsSec = envNumber('LOOP_INTERVAL_US_SEC', 120) ?? 120;
const loopIntervalKrSec = envNumber('LOOP_INTERVAL_KR_SEC', 120) ?? 120;
const maxCandidatesPerMarket = envNumber('MAX_CANDIDATES_PER_MARKET', 30) ?? 30;
const minConfidence = envNumber('MIN_CONFIDENCE', 0.7) ?? 0.7;
const stopLossPct = envNumber('STOP_LOSS_PCT', 0.05) ?? 0.05;
const takeProfitPct = envNumber('TAKE_PROFIT_PCT', 0.1) ?? 0.1;
const maxDailyTrades = envNumber('MAX_DAILY_TRADES', 30) ?? 30;
const maxTradeNotional = envNumber('MAX_TRADE_NOTIONAL', 100_000) ?? 100_000;
const autoDisableConsecutiveFailures = envNumber('AUTO_DISABLE_CONSECUTIVE_FAILURES', 3) ?? 3;
const autoRecoveryCooldownMin = envNumber('AUTO_RECOVERY_COOLDOWN_MIN', 10) ?? 10;

export const TRADING_CONFIG: TradingConfig = {
  enabled: envBoolean('TRADE_EXECUTOR_ENABLED', true),
  dryRun: envBoolean('DRY_RUN', true),
  tradeExecutorRunMode: parseRunMode(env('TRADE_EXECUTOR_RUN_MODE')),
  loopMode: envBoolean('LOOP_MODE', false),
  loopIntervalMs: mustPositiveInt('LOOP_INTERVAL_MS', Math.floor(loopIntervalMs)),
  loopIntervalCryptoSec: mustPositiveInt(
    'LOOP_INTERVAL_CRYPTO_SEC',
    Math.floor(loopIntervalCryptoSec),
  ),
  loopIntervalUsSec: mustPositiveInt('LOOP_INTERVAL_US_SEC', Math.floor(loopIntervalUsSec)),
  loopIntervalKrSec: mustPositiveInt('LOOP_INTERVAL_KR_SEC', Math.floor(loopIntervalKrSec)),
  maxCandidatesPerMarket: mustPositiveInt(
    'MAX_CANDIDATES_PER_MARKET',
    Math.floor(maxCandidatesPerMarket),
  ),
  minConfidence: mustRange('MIN_CONFIDENCE', minConfidence, 0, 1),
  stopLossPct: mustRange('STOP_LOSS_PCT', stopLossPct, 0, 1),
  takeProfitPct: mustRange('TAKE_PROFIT_PCT', takeProfitPct, 0, 10),
  maxDailyTrades: mustPositiveInt('MAX_DAILY_TRADES', Math.floor(maxDailyTrades)),
  maxTradeNotional: mustRange('MAX_TRADE_NOTIONAL', maxTradeNotional, 0, Number.MAX_SAFE_INTEGER),
  enableMarketHoursGuard: envBoolean('ENABLE_MARKET_HOURS_GUARD', true),
  autoDisableConsecutiveFailures: mustPositiveInt(
    'AUTO_DISABLE_CONSECUTIVE_FAILURES',
    Math.floor(autoDisableConsecutiveFailures),
  ),
  autoRecoveryCooldownMin: mustPositiveInt('AUTO_RECOVERY_COOLDOWN_MIN', Math.floor(autoRecoveryCooldownMin)),
  executeMarkets: EXECUTE_MARKETS,
};
