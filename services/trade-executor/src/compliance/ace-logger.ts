import { createLogger } from '@workspace/shared-utils';
import { createACELog, updateACEOutcome } from '@workspace/db-client';
import { buildAspiration, buildCapability, buildExecution, buildOutcome } from './builders.js';
import type { ACELog } from './types.js';
import type { GeneratedSignal } from '@workspace/trading-utils';
import type { RiskValidationResult } from '../risk/types.js';

const logger = createLogger('ace-logger');

/**
 * ACE 로그 생성
 *
 * 거래 실행 전에 호출하여 Aspiration, Capability, Execution을 기록합니다.
 *
 * @param params - ACE 로그 생성 파라미터
 * @returns ACE 로그 ID
 */
export async function logACEEntry(params: {
  signal: GeneratedSignal;
  riskValidation: RiskValidationResult;
  tradeId?: string;
  orderId?: string;
  strategy?: string;
}): Promise<string> {
  const { signal, riskValidation, tradeId, orderId, strategy } = params;

  logger.info('ACE 로그 생성 시작', {
    symbol: signal.symbol,
    market: signal.market,
    signalType: signal.signal_type,
  });

  try {
    // Aspiration 빌드
    const aspiration = buildAspiration({
      signal,
      strategy,
    });

    // Capability 빌드
    const capability = buildCapability({
      signal,
      riskValidation,
    });

    // Execution 빌드
    const execution = buildExecution({
      signal,
      positionSize: riskValidation.positionSize,
      tradeId,
      orderId,
    });

    // DB에 저장 (타입을 Record<string, unknown>로 변환)
    const aceLogId = await createACELog({
      symbol: signal.symbol,
      market: signal.market,
      broker: signal.broker,
      aspiration: aspiration as unknown as Record<string, unknown>,
      capability: capability as unknown as Record<string, unknown>,
      execution: execution as unknown as Record<string, unknown>,
      trade_id: tradeId,
    });

    logger.info('ACE 로그 생성 완료', {
      aceLogId,
      symbol: signal.symbol,
      decision: execution.decision,
    });

    return aceLogId;
  } catch (error) {
    logger.error('ACE 로그 생성 실패', {
      symbol: signal.symbol,
      error,
    });
    throw error;
  }
}

/**
 * ACE Outcome 업데이트
 *
 * 거래 종료 후 호출하여 결과를 기록합니다.
 *
 * @param params - Outcome 업데이트 파라미터
 */
export async function logACEOutcome(params: {
  aceLogId: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  side: 'BUY' | 'SELL';
  entryTime: string;
  exitTime: string;
  exitReason?: string;
}): Promise<void> {
  const { aceLogId, entryPrice, exitPrice, size, side, entryTime, exitTime, exitReason } = params;

  logger.info('ACE Outcome 업데이트 시작', {
    aceLogId,
  });

  try {
    // Outcome 빌드
    const outcome = buildOutcome({
      entryPrice,
      exitPrice,
      size,
      side,
      entryTime,
      exitTime,
      exitReason,
    });

    // DB 업데이트
    await updateACEOutcome(aceLogId, outcome);

    logger.info('ACE Outcome 업데이트 완료', {
      aceLogId,
      result: outcome.result,
      pnLPct: outcome.pnLPct.toFixed(2) + '%',
      realizedPnL: outcome.realizedPnL.toFixed(2),
    });
  } catch (error) {
    logger.error('ACE Outcome 업데이트 실패', {
      aceLogId,
      error,
    });
    throw error;
  }
}

/**
 * 거래 품질 점수 계산
 *
 * ACE 로그를 분석하여 거래 품질을 평가합니다.
 * (향후 구현)
 *
 * @param aceLog - ACE 로그
 * @returns 품질 점수 (0~1)
 */
export function calculateTradeQuality(_aceLog: ACELog): number {
  // TODO: 실제 품질 점수 계산 로직 구현
  // - 계획 대비 실행 정확도
  // - 리스크 관리 준수 여부
  // - 목표 달성 여부
  // - 보유 기간 준수 여부

  return 0.8; // 임시값
}
