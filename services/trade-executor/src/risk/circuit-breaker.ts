import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger } from '@workspace/shared-utils';
import { getSupabase, logRiskEvent } from '@workspace/db-client';
import { getCurrentPositionValue } from './exposure-tracker.js';
import type { CircuitBreakerState, DailyPnLResult, Broker } from './types.js';

const logger = createLogger('circuit-breaker');

/**
 * 서킷 브레이커 설정
 */
const CIRCUIT_BREAKER_CONFIG = {
  /** 일일 최대 손실 퍼센트 (-5%) */
  MAX_DAILY_LOSS_PCT: -0.05,
  /** 쿨다운 시간 (분) */
  COOLDOWN_MINUTES: 60,
};

/**
 * 일일 실현 손익 계산
 *
 * 오늘 체결된 거래들의 실현 손익을 계산합니다.
 *
 * @param broker - 브로커 (선택)
 * @returns 실현 손익
 */
async function calculateRealizedPnL(broker?: Broker): Promise<Big> {
  const supabase = getSupabase();

  // 오늘 00:00 UTC
  const todayStart = DateTime.now().startOf('day').toISO();

  if (!todayStart) {
    throw new Error('날짜 변환 실패');
  }

  let query = supabase
    .from('trades')
    .select('qty, price, side')
    .gte('executed_at', todayStart)
    .eq('status', 'filled');

  if (broker) {
    query = query.eq('broker', broker);
  }

  const { data, error } = await query;

  if (error) {
    logger.error('거래 내역 조회 실패', { error });
    throw new Error(`거래 내역 조회 실패: ${error.message}`);
  }

  // 간단한 P&L 계산 (매수 - 매도)
  // TODO: 실제로는 평균 단가 기반 계산 필요
  let totalBuy = new Big(0);
  let totalSell = new Big(0);

  for (const trade of data || []) {
    const value = new Big(trade.qty as string).times(new Big(trade.price as string));
    if (trade.side === 'BUY') {
      totalBuy = totalBuy.plus(value);
    } else {
      totalSell = totalSell.plus(value);
    }
  }

  return totalSell.minus(totalBuy);
}

/**
 * 미실현 손익 계산
 *
 * 현재 보유 중인 포지션의 미실현 손익을 계산합니다.
 *
 * @param broker - 브로커 (선택)
 * @returns 미실현 손익
 */
async function calculateUnrealizedPnL(broker?: Broker): Promise<Big> {
  const supabase = getSupabase();

  // 보유 포지션 조회
  let query = supabase
    .from('positions')
    .select('symbol, market, qty, avg_price')
    .gt('qty', 0);

  if (broker) {
    query = query.eq('broker', broker);
  }

  const { data: positions, error } = await query;

  if (error) {
    logger.error('포지션 조회 실패', { error });
    throw new Error(`포지션 조회 실패: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    return new Big(0);
  }

  // 각 포지션의 미실현 손익 계산
  let totalUnrealizedPnL = new Big(0);

  for (const position of positions) {
    // 현재 포지션 가치
    const currentValue = await getCurrentPositionValue({
      broker,
      market: position.market,
      symbol: position.symbol,
    });

    // 평균 단가 기준 원가
    const costBasis = new Big(position.qty).times(new Big(position.avg_price));

    // 미실현 손익 = 현재 가치 - 원가
    const unrealizedPnL = currentValue.minus(costBasis);
    totalUnrealizedPnL = totalUnrealizedPnL.plus(unrealizedPnL);

    logger.debug('포지션 미실현 손익 계산', {
      symbol: position.symbol,
      qty: position.qty,
      avgPrice: position.avg_price,
      currentValue: currentValue.toString(),
      costBasis: costBasis.toString(),
      unrealizedPnL: unrealizedPnL.toString(),
    });
  }

  logger.info('총 미실현 손익 계산 완료', {
    broker,
    totalUnrealizedPnL: totalUnrealizedPnL.toString(),
  });

  return totalUnrealizedPnL;
}

/**
 * 일일 P&L 계산
 *
 * 실현 손익 + 미실현 손익을 계산합니다.
 *
 * @param broker - 브로커 (선택)
 * @returns 일일 P&L 결과
 */
export async function calculateDailyPnL(broker?: Broker): Promise<DailyPnLResult> {
  logger.info('일일 P&L 계산 시작', { broker });

  const realizedPnL = await calculateRealizedPnL(broker);
  const unrealizedPnL = await calculateUnrealizedPnL(broker);
  const totalPnL = realizedPnL.plus(unrealizedPnL);

  // 계좌 크기 조회
  const supabase = getSupabase();
  let cashQuery = supabase.from('account_cash').select('total');

  if (broker) {
    cashQuery = cashQuery.eq('broker', broker);
  }

  const { data: cashData } = await cashQuery.maybeSingle();
  const accountSize = cashData?.total ? new Big(cashData.total) : new Big(1); // 0 방지

  const totalPnLPct = totalPnL.div(accountSize);

  logger.info('일일 P&L 계산 완료', {
    broker,
    realizedPnL: realizedPnL.toString(),
    unrealizedPnL: unrealizedPnL.toString(),
    totalPnL: totalPnL.toString(),
    totalPnLPct: totalPnLPct.times(100).toFixed(2) + '%',
  });

  return {
    realizedPnL,
    unrealizedPnL,
    totalPnL,
    totalPnLPct,
    calculatedAt: new Date().toISOString(),
  };
}

/**
 * 거래 중지 설정
 *
 * system_guard 테이블의 trading_enabled를 false로 설정합니다.
 */
async function haltTrading(): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('system_guard')
    .update({ trading_enabled: false })
    .eq('id', 'default');

  if (error) {
    logger.error('거래 중지 설정 실패', { error });
    throw new Error(`거래 중지 설정 실패: ${error.message}`);
  }

  logger.warn('⚠️  거래 중지됨 (Circuit Breaker)');
}

/**
 * 전체 포지션 청산
 *
 * 모든 보유 포지션을 시장가로 매도합니다.
 * Circuit Breaker 발동 시 호출됩니다.
 */
async function liquidateAllPositions(): Promise<void> {
  logger.warn('⚠️  전체 포지션 청산 시작 (Circuit Breaker)');

  const supabase = getSupabase();

  // 1. 모든 포지션 조회
  const { data: positions, error } = await supabase
    .from('positions')
    .select('symbol, market, broker, qty, avg_price')
    .gt('qty', 0);

  if (error) {
    logger.error('포지션 조회 실패', { error });
    throw new Error(`포지션 조회 실패: ${error.message}`);
  }

  if (!positions || positions.length === 0) {
    logger.info('청산할 포지션 없음');
    return;
  }

  logger.info('청산할 포지션 수', { count: positions.length });

  // 2. 각 포지션에 대해 시장가 매도 주문
  const liquidations: Array<{ symbol: string; success: boolean; error?: string }> = [];

  for (const position of positions) {
    try {
      // 현재가 조회 (최신 캔들)
      const currentValue = await getCurrentPositionValue({
        broker: position.broker,
        market: position.market,
        symbol: position.symbol,
      });

      const currentPrice = currentValue.div(new Big(position.qty));

      // trades 테이블에 긴급 청산 기록
      const { error: tradeError } = await supabase.from('trades').insert({
        symbol: position.symbol,
        broker: position.broker,
        market: position.market,
        side: 'SELL',
        qty: position.qty,
        price: currentPrice.toString(),
        status: 'filled',
        executed_at: new Date().toISOString(),
      });

      if (tradeError) {
        logger.error('거래 기록 실패', { symbol: position.symbol, error: tradeError });
        liquidations.push({
          symbol: position.symbol,
          success: false,
          error: tradeError.message,
        });
        continue;
      }

      // 포지션 수량 0으로 업데이트
      await supabase
        .from('positions')
        .update({ qty: '0', updated_at: new Date().toISOString() })
        .eq('symbol', position.symbol)
        .eq('broker', position.broker)
        .eq('market', position.market);

      liquidations.push({ symbol: position.symbol, success: true });

      logger.info('포지션 청산 완료', {
        symbol: position.symbol,
        qty: position.qty,
        price: currentPrice.toString(),
      });
    } catch (error) {
      logger.error('포지션 청산 실패', { symbol: position.symbol, error });
      liquidations.push({
        symbol: position.symbol,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // 3. notification_events 발행
  const successCount = liquidations.filter((l) => l.success).length;
  const failCount = liquidations.filter((l) => !l.success).length;

  await supabase.from('notification_events').insert({
    type: 'circuit_breaker',
    message: `🚨 Circuit Breaker 발동 - 전체 포지션 청산 (성공: ${successCount}, 실패: ${failCount})`,
    metadata: { liquidations },
  });

  logger.warn('전체 포지션 청산 완료', {
    total: positions.length,
    success: successCount,
    fail: failCount,
  });
}

/**
 * 서킷 브레이커 체크
 *
 * 일일 손실이 -5%를 초과하면 서킷 브레이커를 발동합니다.
 * - 거래 중지 (trading_enabled = false)
 * - 전체 포지션 청산
 * - 60분 쿨다운
 *
 * @param broker - 브로커 (선택)
 * @returns 서킷 브레이커 상태
 */
export async function checkCircuitBreaker(broker?: Broker): Promise<CircuitBreakerState> {
  logger.debug('서킷 브레이커 체크 시작', { broker });

  // 1. 일일 P&L 계산
  const dailyPnL = await calculateDailyPnL(broker);

  // 2. 한도 체크
  if (dailyPnL.totalPnLPct.lte(CIRCUIT_BREAKER_CONFIG.MAX_DAILY_LOSS_PCT)) {
    logger.error('🚨 서킷 브레이커 발동!', {
      dailyPnL: dailyPnL.totalPnL.toString(),
      dailyPnLPct: dailyPnL.totalPnLPct.times(100).toFixed(2) + '%',
      limit: CIRCUIT_BREAKER_CONFIG.MAX_DAILY_LOSS_PCT * 100 + '%',
    });

    // 3. 리스크 이벤트 로깅
    await logRiskEvent({
      event_type: 'circuit_breaker',
      violation_details: {
        dailyPnL: dailyPnL.totalPnL.toString(),
        dailyPnLPct: dailyPnL.totalPnLPct.toNumber(),
        limit: CIRCUIT_BREAKER_CONFIG.MAX_DAILY_LOSS_PCT,
        broker,
      },
      severity: 'critical',
    });

    // 4. 긴급 조치
    await haltTrading();
    await liquidateAllPositions();

    // 5. 쿨다운 시간 계산 및 저장
    const cooldownUntil = DateTime.now()
      .plus({ minutes: CIRCUIT_BREAKER_CONFIG.COOLDOWN_MINUTES })
      .toISO();

    if (cooldownUntil) {
      await setCooldown(cooldownUntil);
    }

    return {
      triggered: true,
      reason: '일일 손실 한도 초과',
      dailyPnL: dailyPnL.totalPnL,
      dailyPnLPct: dailyPnL.totalPnLPct,
      cooldownUntil: cooldownUntil || undefined,
    };
  }

  logger.debug('서킷 브레이커 정상', {
    dailyPnLPct: dailyPnL.totalPnLPct.times(100).toFixed(2) + '%',
  });

  return {
    triggered: false,
    reason: '정상',
    dailyPnL: dailyPnL.totalPnL,
    dailyPnLPct: dailyPnL.totalPnLPct,
  };
}

/**
 * 서킷 브레이커 쿨다운 상태 저장
 *
 * system_guard에 쿨다운 종료 시각을 저장합니다.
 *
 * @param cooldownUntil - 쿨다운 종료 시각 (ISO string)
 */
async function setCooldown(cooldownUntil: string): Promise<void> {
  const supabase = getSupabase();

  // system_guard 테이블에 쿨다운 시각 저장
  // NOTE: circuit_breaker_cooldown_until 컬럼이 없다면 DB 마이그레이션 필요
  const { error } = await supabase
    .from('system_guard')
    .update({
      circuit_breaker_cooldown_until: cooldownUntil,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 'default');

  if (error) {
    logger.error('쿨다운 상태 저장 실패', { error, cooldownUntil });
    // 에러가 발생해도 계속 진행 (쿨다운 저장은 optional)
  } else {
    logger.info('쿨다운 상태 저장 완료', { cooldownUntil });
  }
}

/**
 * 서킷 브레이커 쿨다운 체크
 *
 * system_guard에서 쿨다운 상태를 확인합니다.
 * 쿨다운 중이면 거래가 제한됩니다.
 *
 * @returns 쿨다운 중 여부
 */
export async function isInCooldown(): Promise<boolean> {
  const supabase = getSupabase();

  // system_guard 테이블에서 쿨다운 시각 조회
  const { data, error } = await supabase
    .from('system_guard')
    .select('circuit_breaker_cooldown_until')
    .eq('id', 'default')
    .maybeSingle();

  if (error) {
    logger.error('쿨다운 상태 조회 실패', { error });
    // 에러 시 안전하게 false 반환 (쿨다운 아님)
    return false;
  }

  if (!data || !data.circuit_breaker_cooldown_until) {
    // 쿨다운 시각이 설정되지 않음
    return false;
  }

  const cooldownUntil = DateTime.fromISO(data.circuit_breaker_cooldown_until);
  const now = DateTime.now();

  const inCooldown = now < cooldownUntil;

  if (inCooldown) {
    const remainingMinutes = cooldownUntil.diff(now, 'minutes').minutes;
    logger.info('Circuit Breaker 쿨다운 중', {
      cooldownUntil: cooldownUntil.toISO(),
      remainingMinutes: remainingMinutes.toFixed(1),
    });
  }

  return inCooldown;
}
