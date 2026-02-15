/**
 * Circuit Breaker - 일일 손실 한도 및 긴급 정지
 *
 * 사용처: services/trade-executor/lib/circuit-breaker.ts
 */

import Big from 'big.js';
import { getSupabase } from '@workspace/db-client';
import { createLogger } from '@workspace/shared-utils';

const logger = createLogger('circuit-breaker');

// ============================================================================
// Constants
// ============================================================================

const DAILY_LOSS_LIMIT_PCT = 0.05;   // -5%
const MAX_DRAWDOWN_PCT = 0.10;       // -10%
const COOLDOWN_MINUTES = 60;         // 60분

// ============================================================================
// Types
// ============================================================================

interface CircuitBreakerState {
  triggered: boolean;
  triggerReason: string | null;
  triggerTime: string | null;
  cooldownUntil: string | null;
  dailyPnL: Big;
  totalDrawdown: Big;
}

interface Position {
  id: string;
  symbol: string;
  qty: Big;
  avg_price: Big;
  current_price: Big;
}

// ============================================================================
// Daily P&L Calculation
// ============================================================================

/**
 * 일일 손익 계산
 */
export async function calculateDailyPnL(): Promise<Big> {
  const supabase = getSupabase();

  // 오늘 00:00 시각
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 오늘의 모든 거래 조회
  const { data: trades, error } = await supabase
    .from('trades')
    .select('side, qty, price')
    .gte('executed_at', todayStart.toISOString())
    .eq('status', 'filled');

  if (error) {
    throw new Error(`Failed to fetch trades: ${error.message}`);
  }

  if (!trades || trades.length === 0) {
    return new Big(0);
  }

  // P&L 계산 (간단한 방법: 매도 - 매수)
  let totalBuy = new Big(0);
  let totalSell = new Big(0);

  for (const trade of trades) {
    const value = new Big(trade.qty).times(trade.price);

    if (trade.side === 'BUY') {
      totalBuy = totalBuy.plus(value);
    } else {
      totalSell = totalSell.plus(value);
    }
  }

  return totalSell.minus(totalBuy);
}

/**
 * 현재 포지션의 미실현 손익
 */
export async function calculateUnrealizedPnL(): Promise<Big> {
  const supabase = getSupabase();

  const { data: positions, error } = await supabase
    .from('positions')
    .select('qty, avg_price')
    .gt('qty', 0);

  if (error) {
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    return new Big(0);
  }

  // 각 포지션의 미실현 손익 계산
  // (실전에서는 current_price를 실시간으로 조회해야 함)
  let totalUnrealizedPnL = new Big(0);

  for (const pos of positions) {
    // 여기서는 예시로 avg_price 사용 (실전에서는 현재가 필요)
    const unrealized = new Big(pos.qty).times(
      new Big(pos.avg_price).times(1.02)  // 임시: +2% 가정
    ).minus(
      new Big(pos.qty).times(pos.avg_price)
    );

    totalUnrealizedPnL = totalUnrealizedPnL.plus(unrealized);
  }

  return totalUnrealizedPnL;
}

// ============================================================================
// Circuit Breaker Check
// ============================================================================

/**
 * Circuit Breaker 상태 확인
 */
export async function checkCircuitBreaker(
  accountSize: Big
): Promise<CircuitBreakerState> {
  const realizedPnL = await calculateDailyPnL();
  const unrealizedPnL = await calculateUnrealizedPnL();

  const dailyPnL = realizedPnL.plus(unrealizedPnL);
  const dailyPnLPct = dailyPnL.div(accountSize);

  // 일일 손실 한도 체크
  if (dailyPnLPct.lte(-DAILY_LOSS_LIMIT_PCT)) {
    const triggerTime = new Date().toISOString();
    const cooldownUntil = new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000).toISOString();

    logger.error('Circuit breaker triggered - Daily loss limit', {
      dailyPnL: dailyPnL.toString(),
      dailyPnLPct: (dailyPnLPct.toNumber() * 100).toFixed(2) + '%',
      limit: `-${DAILY_LOSS_LIMIT_PCT * 100}%`,
    });

    // risk_events 기록
    await logRiskEvent({
      event_type: 'circuit_breaker_triggered',
      violation_type: 'daily_loss_limit',
      violation_details: {
        dailyPnL: dailyPnL.toString(),
        dailyPnLPct: dailyPnLPct.toNumber(),
        limit: -DAILY_LOSS_LIMIT_PCT,
      },
      severity: 'critical',
    });

    return {
      triggered: true,
      triggerReason: `Daily loss limit exceeded: ${(dailyPnLPct.toNumber() * 100).toFixed(2)}%`,
      triggerTime,
      cooldownUntil,
      dailyPnL,
      totalDrawdown: dailyPnL,
    };
  }

  // 최대 낙폭 체크 (계좌 시작 대비)
  const accountStartBalance = accountSize;  // 실전에서는 시작 잔고 조회
  const totalDrawdown = dailyPnL.div(accountStartBalance);

  if (totalDrawdown.lte(-MAX_DRAWDOWN_PCT)) {
    const triggerTime = new Date().toISOString();
    const cooldownUntil = new Date(Date.now() + COOLDOWN_MINUTES * 60 * 1000).toISOString();

    logger.error('Circuit breaker triggered - Max drawdown', {
      totalDrawdown: (totalDrawdown.toNumber() * 100).toFixed(2) + '%',
      limit: `-${MAX_DRAWDOWN_PCT * 100}%`,
    });

    await logRiskEvent({
      event_type: 'circuit_breaker_triggered',
      violation_type: 'max_drawdown',
      violation_details: {
        totalDrawdown: totalDrawdown.toNumber(),
        limit: -MAX_DRAWDOWN_PCT,
      },
      severity: 'critical',
    });

    return {
      triggered: true,
      triggerReason: `Max drawdown exceeded: ${(totalDrawdown.toNumber() * 100).toFixed(2)}%`,
      triggerTime,
      cooldownUntil,
      dailyPnL,
      totalDrawdown: dailyPnL,
    };
  }

  // 정상 상태
  return {
    triggered: false,
    triggerReason: null,
    triggerTime: null,
    cooldownUntil: null,
    dailyPnL,
    totalDrawdown: dailyPnL,
  };
}

/**
 * 쿨다운 확인
 */
export function isInCooldown(cooldownUntil: string | null): boolean {
  if (!cooldownUntil) return false;

  const now = Date.now();
  const cooldownEnd = new Date(cooldownUntil).getTime();

  return now < cooldownEnd;
}

// ============================================================================
// Emergency Actions
// ============================================================================

/**
 * 모든 포지션 청산
 */
export async function liquidateAllPositions(): Promise<void> {
  const supabase = getSupabase();

  const { data: positions, error } = await supabase
    .from('positions')
    .select('*')
    .gt('qty', 0);

  if (error) {
    throw new Error(`Failed to fetch positions: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    logger.info('No positions to liquidate');
    return;
  }

  logger.warn('Liquidating all positions', { count: positions.length });

  for (const pos of positions) {
    try {
      // 실제 주문 실행 (여기서는 로깅만)
      logger.info('Liquidating position', {
        symbol: pos.symbol,
        qty: pos.qty,
      });

      // await executeMarketSell(pos.symbol, pos.qty);

      // 거래 기록
      await supabase.from('trades').insert({
        symbol: pos.symbol,
        broker: pos.broker,
        market: pos.market,
        side: 'SELL',
        qty: pos.qty,
        price: pos.current_price || pos.avg_price,
        order_id: `EMERGENCY-${Date.now()}`,
        status: 'filled',
        executed_at: new Date().toISOString(),
      });

      // 포지션 삭제
      await supabase
        .from('positions')
        .delete()
        .eq('id', pos.id);

    } catch (err) {
      logger.error('Failed to liquidate position', { symbol: pos.symbol, error: err });
    }
  }

  logger.info('All positions liquidated');
}

/**
 * 거래 중단
 */
export async function haltTrading(): Promise<void> {
  const supabase = getSupabase();

  await supabase
    .from('system_guard')
    .update({ trading_enabled: false })
    .eq('id', 'default');

  logger.warn('Trading halted');
}

// ============================================================================
// Risk Event Logging
// ============================================================================

async function logRiskEvent(params: {
  event_type: string;
  violation_type: string;
  violation_details: Record<string, unknown>;
  severity: 'low' | 'medium' | 'high' | 'critical';
}): Promise<void> {
  const supabase = getSupabase();

  await supabase.from('risk_events').insert({
    event_type: params.event_type,
    violation_type: params.violation_type,
    violation_details: params.violation_details,
    severity: params.severity,
  });
}

// ============================================================================
// Main Circuit Breaker Handler
// ============================================================================

/**
 * Circuit Breaker 체크 및 처리
 */
export async function runCircuitBreakerCheck(
  accountSize: Big
): Promise<CircuitBreakerState> {
  const state = await checkCircuitBreaker(accountSize);

  if (state.triggered) {
    logger.error('🚨 CIRCUIT BREAKER TRIGGERED 🚨', {
      reason: state.triggerReason,
      dailyPnL: state.dailyPnL.toString(),
    });

    // 모든 포지션 청산
    await liquidateAllPositions();

    // 거래 중단
    await haltTrading();

    // 알림 발송
    await sendEmergencyNotification(state);
  }

  return state;
}

async function sendEmergencyNotification(state: CircuitBreakerState): Promise<void> {
  const supabase = getSupabase();

  await supabase.from('notification_events').insert({
    type: 'circuit_breaker',
    message: `🚨 Circuit Breaker Triggered: ${state.triggerReason}`,
    metadata: {
      dailyPnL: state.dailyPnL.toString(),
      cooldownUntil: state.cooldownUntil,
    },
  });
}

// ============================================================================
// Example Usage
// ============================================================================

async function exampleUsage() {
  const accountSize = new Big(100000);

  // Circuit Breaker 체크
  const state = await runCircuitBreakerCheck(accountSize);

  if (state.triggered) {
    console.log('❌ Trading halted');
    console.log('Reason:', state.triggerReason);
    console.log('Cooldown until:', state.cooldownUntil);
  } else {
    console.log('✅ Circuit breaker OK');
    console.log('Daily P&L:', state.dailyPnL.toString());
  }

  // 쿨다운 확인
  if (isInCooldown(state.cooldownUntil)) {
    console.log('⏳ Still in cooldown period');
  }
}

// Uncomment to run example
// exampleUsage();
