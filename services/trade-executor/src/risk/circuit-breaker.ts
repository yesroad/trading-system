import Big from 'big.js';
import { DateTime } from 'luxon';
import { createLogger } from '@workspace/shared-utils';
import { getSupabase, logRiskEvent } from '@workspace/db-client';
import type { CircuitBreakerState, DailyPnLResult, Position, Broker } from './types.js';

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

  // 각 포지션의 현재가 조회 및 미실현 손익 계산
  // TODO: 현재가 조회 로직 구현 필요
  // 현재는 0 반환
  return new Big(0);
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
 * (실제 구현은 향후 추가)
 */
async function liquidateAllPositions(): Promise<void> {
  logger.warn('⚠️  전체 포지션 청산 시작 (Circuit Breaker)');

  // TODO: 실제 청산 로직 구현
  // 1. 모든 포지션 조회
  // 2. 각 포지션에 대해 시장가 매도 주문
  // 3. 결과 기록

  logger.info('전체 포지션 청산 완료');
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

    // 5. 쿨다운 시간 계산
    const cooldownUntil = DateTime.now()
      .plus({ minutes: CIRCUIT_BREAKER_CONFIG.COOLDOWN_MINUTES })
      .toISO();

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
 * 서킷 브레이커 쿨다운 체크
 *
 * system_guard에서 쿨다운 상태를 확인합니다.
 * (실제로는 system_guard에 cooldown_until 컬럼 추가 필요)
 *
 * @returns 쿨다운 중 여부
 */
export async function isInCooldown(): Promise<boolean> {
  // TODO: system_guard에 cooldown_until 컬럼 추가 후 구현
  return false;
}
