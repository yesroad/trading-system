import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';
import { calculatePositionSize as calculatePositionSizeUtil } from '@workspace/trading-utils';
import type { PositionSizingParams, PositionSizingResult, Broker } from './types.js';

const logger = createLogger('position-sizer');
type AccountCashRow = Record<string, unknown>;

function resolveCashAmount(row: AccountCashRow | null): Big {
  if (!row) return new Big(0);

  const value = row.cash_available ?? row.total;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Big(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    try {
      return new Big(value);
    } catch {
      return new Big(0);
    }
  }

  return new Big(0);
}

/**
 * 계좌 크기 조회
 *
 * @param broker - 브로커
 * @returns 총 계좌 크기 (현금 + 포지션 가치)
 */
export async function getAccountSize(broker: Broker): Promise<Big> {
  const supabase = getSupabase();

  // 1. 현금 조회
  // NOTE:
  // account_cash 스키마가 환경별로 total/cash_available가 혼재할 수 있어 * 조회 후 안전 파싱한다.
  // 또한 unique 제약 부재 환경에서 다중 row가 생길 수 있어 limit(1)로 조회 실패를 방지한다.
  const { data: cashData, error: cashError } = await supabase
    .from('account_cash')
    .select('*')
    .eq('broker', broker)
    .limit(1)
    .maybeSingle();

  if (cashError) {
    logger.error('계좌 현금 조회 실패', { broker, error: cashError });
    throw new Error(`계좌 현금 조회 실패: ${cashError.message}`);
  }

  const cash = resolveCashAmount((cashData ?? null) as AccountCashRow | null);

  // 2. 포지션 가치 조회 (현재가 필요)
  // 현재는 간단히 현금만 사용 (향후 개선)
  // TODO: 포지션 가치 계산 추가

  logger.debug('계좌 크기 조회 완료', {
    broker,
    cash: cash.toString(),
  });

  return cash;
}

/**
 * 포지션 크기 계산
 *
 * Kelly Criterion 기반으로 포지션 크기를 계산합니다.
 * - 기본 리스크: 1% (0.01)
 * - 최대 포지션: 계좌의 25%
 *
 * @param params - 포지션 사이징 파라미터
 * @returns 포지션 사이징 결과
 */
export async function calculateOptimalPositionSize(
  params: PositionSizingParams,
): Promise<PositionSizingResult> {
  const { accountSize, riskPercentage, entry, stopLoss, symbol } = params;

  logger.info('포지션 크기 계산 시작', {
    symbol,
    accountSize: accountSize.toString(),
    riskPercentage,
    entry: entry.toString(),
    stopLoss: stopLoss.toString(),
  });

  // trading-utils의 계산 함수 사용
  const result = calculatePositionSizeUtil({
    accountSize,
    riskPercentage,
    entry,
    stopLoss,
  });

  logger.info('포지션 크기 계산 완료', {
    symbol,
    positionSize: result.positionSize.toString(),
    positionValue: result.positionValue.toString(),
    riskAmount: result.riskAmount.toString(),
    limitedByMaxExposure: result.limitedByMaxExposure,
  });

  return result;
}

/**
 * 브로커별 계좌 크기 기반 포지션 크기 계산
 *
 * @param params - 포지션 사이징 파라미터 (accountSize 제외)
 * @param broker - 브로커
 * @returns 포지션 사이징 결과
 */
export async function calculatePositionSizeForBroker(
  params: Omit<PositionSizingParams, 'accountSize'>,
  broker: Broker,
): Promise<PositionSizingResult> {
  // 계좌 크기 조회
  const accountSize = await getAccountSize(broker);

  // 포지션 크기 계산
  return calculateOptimalPositionSize({
    ...params,
    accountSize,
  });
}
