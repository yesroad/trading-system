import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { insertTradingSignal } from '@workspace/db-client';
import { calculateATRStopLoss, calculateATRStopLossShort } from '@workspace/trading-utils';
import type {
  SignalGenerationParams,
  GeneratedSignal,
  SignalPrices,
  TechnicalSnapshot,
} from './types.js';
import { analyzeTechnicalIndicators } from './technical-analyzer.js';
import { calculateTechnicalConfidence, blendConfidence } from './confidence-engine.js';
import { validateSignal } from './validator.js';

const logger = createLogger('signal-generator');

/**
 * 신호 가격 계산
 *
 * ATR 기반으로 진입가, 목표가, 손절가를 계산합니다.
 *
 * @param params - 가격 계산 파라미터
 * @returns 신호 가격 정보
 */
function calculateSignalPrices(params: {
  direction: 'BUY' | 'SELL';
  currentPrice: Big;
  atr: Big;
  priceAtAnalysis: string;
}): SignalPrices {
  const { direction, currentPrice, atr, priceAtAnalysis } = params;

  // 진입가: 현재가 사용 (또는 분석 시점 가격과 비교하여 더 유리한 가격 선택)
  const analysisPrice = new Big(priceAtAnalysis);
  let entry: Big;

  if (direction === 'BUY') {
    // 매수: 더 낮은 가격 선택
    entry = currentPrice.lt(analysisPrice) ? currentPrice : analysisPrice;
  } else {
    // 매도: 더 높은 가격 선택
    entry = currentPrice.gt(analysisPrice) ? currentPrice : analysisPrice;
  }

  // 손절가: ATR 기반 계산 (2.0x ATR, 0.5%~5% 범위)
  const stopLossResult =
    direction === 'BUY'
      ? calculateATRStopLoss({
          entry,
          atr,
          multiplier: 2.0,
          minPct: 0.005,
          maxPct: 0.05,
        })
      : calculateATRStopLossShort({
          entry,
          atr,
          multiplier: 2.0,
          minPct: 0.005,
          maxPct: 0.05,
        });

  const stopLoss = stopLossResult.stopLoss;

  // 목표가: R/R 2.0 (손절 거리의 2배)
  const stopDistance = entry.minus(stopLoss).abs();
  const targetDistance = stopDistance.times(2.0);

  let target: Big;
  if (direction === 'BUY') {
    target = entry.plus(targetDistance);
  } else {
    target = entry.minus(targetDistance);
  }

  logger.debug('신호 가격 계산 완료', {
    direction,
    currentPrice: currentPrice.toString(),
    analysisPrice: priceAtAnalysis,
    entry: entry.toString(),
    target: target.toString(),
    stopLoss: stopLoss.toString(),
    stopDistance: stopDistance.toString(),
    targetDistance: targetDistance.toString(),
  });

  return {
    entry,
    target,
    stopLoss,
  };
}

/**
 * AI 분석 결과로부터 거래 신호 생성
 *
 * 전체 프로세스:
 * 1. AI 신호 필터링 (SKIP or 신뢰도 < 0.4 → null)
 * 2. 기술적 지표 분석
 * 3. 기술적 신뢰도 계산
 * 4. AI + 기술적 신뢰도 블렌딩 (60% AI + 40% 기술적)
 * 5. 진입가/목표가/손절가 계산 (ATR 기반)
 * 6. 신호 검증 (R/R >= 1.5, 손절 0.5~5%, 신뢰도 >= 0.4)
 * 7. DB 저장
 *
 * @param params - 신호 생성 파라미터
 * @returns 생성된 신호 또는 null (생성 실패 시)
 */
export async function generateSignalFromAIAnalysis(
  params: SignalGenerationParams
): Promise<GeneratedSignal | null> {
  logger.info('신호 생성 시작', {
    symbol: params.symbol,
    market: params.market,
    aiDecision: params.aiDecision,
    aiConfidence: params.aiConfidence,
  });

  // 1. AI 신호 필터링
  if (params.aiDecision === 'SKIP') {
    logger.info('AI 결정이 SKIP - 신호 생성 건너뜀', {
      symbol: params.symbol,
      aiAnalysisId: params.aiAnalysisId,
    });
    return null;
  }

  if (params.aiConfidence < 0.4) {
    logger.info('AI 신뢰도 너무 낮음 - 신호 생성 건너뜀', {
      symbol: params.symbol,
      aiConfidence: params.aiConfidence,
      threshold: 0.4,
    });
    return null;
  }

  try {
    // 2. 기술적 지표 분석
    logger.info('기술적 지표 분석 중...', { symbol: params.symbol, market: params.market });
    const technicalSnapshot: TechnicalSnapshot = await analyzeTechnicalIndicators({
      market: params.market,
      symbol: params.symbol,
    });

    // 3. ATR 확인 (필수)
    if (!technicalSnapshot.atr) {
      logger.warn('ATR 데이터 없음 - 신호 생성 불가', {
        symbol: params.symbol,
      });
      return null;
    }

    // 4. 기술적 신뢰도 계산
    const technicalConfidence = calculateTechnicalConfidence(
      technicalSnapshot,
      params.aiDecision
    );

    logger.info('기술적 신뢰도 계산 완료', {
      symbol: params.symbol,
      technicalConfidence,
    });

    // 5. AI + 기술적 신뢰도 블렌딩
    const confidenceResult = blendConfidence({
      aiConfidence: params.aiConfidence,
      technicalConfidence,
    });

    const finalConfidence = confidenceResult.finalConfidence;

    logger.info('최종 신뢰도 블렌딩 완료', {
      symbol: params.symbol,
      aiConfidence: params.aiConfidence,
      technicalConfidence,
      finalConfidence,
    });

    // 6. 진입가/목표가/손절가 계산
    const prices = calculateSignalPrices({
      direction: params.aiDecision,
      currentPrice: technicalSnapshot.currentPrice,
      atr: technicalSnapshot.atr,
      priceAtAnalysis: params.priceAtAnalysis,
    });

    // 7. 신호 검증
    const validation = validateSignal({
      prices,
      confidence: finalConfidence,
      direction: params.aiDecision,
      technicalSnapshot,
    });

    if (!validation.valid) {
      logger.warn('신호 검증 실패 - 생성 중단', {
        symbol: params.symbol,
        violations: validation.violations,
      });
      return null;
    }

    logger.info('신호 검증 통과', {
      symbol: params.symbol,
      riskRewardRatio: validation.riskRewardRatio?.toFixed(2),
      stopLossPct: validation.stopLossPct?.times(100).toFixed(2) + '%',
    });

    // 8. 신호 생성 근거 작성
    const reason = [
      `AI 결정: ${params.aiDecision} (신뢰도 ${params.aiConfidence.toFixed(2)})`,
      `기술적 신뢰도: ${technicalConfidence.toFixed(2)}`,
      `최종 신뢰도: ${finalConfidence.toFixed(2)}`,
      `R/R 비율: ${validation.riskRewardRatio?.toFixed(2)}`,
      params.aiReasoning ? `AI 근거: ${params.aiReasoning}` : '',
    ]
      .filter(Boolean)
      .join(' | ');

    // 9. 기술적 지표 스냅샷 직렬화
    const indicators = {
      sma20: technicalSnapshot.sma20?.toString() ?? null,
      ema20: technicalSnapshot.ema20?.toString() ?? null,
      macd: technicalSnapshot.macd
        ? {
            macd: technicalSnapshot.macd.macd.toString(),
            signal: technicalSnapshot.macd.signal.toString(),
            histogram: technicalSnapshot.macd.histogram.toString(),
          }
        : null,
      rsi: technicalSnapshot.rsi
        ? {
            value: technicalSnapshot.rsi.value.toString(),
            overbought: technicalSnapshot.rsi.overbought,
            oversold: technicalSnapshot.rsi.oversold,
          }
        : null,
      volume: technicalSnapshot.volume
        ? {
            avgVolume: technicalSnapshot.volume.avgVolume.toString(),
            currentVolume: technicalSnapshot.volume.currentVolume.toString(),
            volumeRatio: technicalSnapshot.volume.volumeRatio.toString(),
            isHighVolume: technicalSnapshot.volume.isHighVolume,
          }
        : null,
      supportResistance: technicalSnapshot.supportResistance.map((sr) => ({
        price: sr.price.toString(),
        type: sr.type,
        strength: sr.strength,
        touches: sr.touches,
      })),
      atr: technicalSnapshot.atr.toString(),
      currentPrice: technicalSnapshot.currentPrice.toString(),
      calculatedAt: technicalSnapshot.calculatedAt,
    };

    // 10. DB에 저장
    const signalId = await insertTradingSignal({
      symbol: params.symbol,
      market: params.market,
      broker: params.broker,
      signal_type: params.aiDecision,
      entry_price: prices.entry.toString(),
      target_price: prices.target.toString(),
      stop_loss: prices.stopLoss.toString(),
      confidence: finalConfidence,
      reason,
      indicators,
      ai_analysis_id: params.aiAnalysisId,
    });

    logger.info('거래 신호 생성 성공', {
      signalId,
      symbol: params.symbol,
      market: params.market,
      signal_type: params.aiDecision,
      entry_price: prices.entry.toString(),
      target_price: prices.target.toString(),
      stop_loss: prices.stopLoss.toString(),
      confidence: finalConfidence,
    });

    const generatedSignal: GeneratedSignal = {
      id: signalId,
      symbol: params.symbol,
      market: params.market,
      broker: params.broker,
      signal_type: params.aiDecision,
      entry_price: prices.entry.toString(),
      target_price: prices.target.toString(),
      stop_loss: prices.stopLoss.toString(),
      confidence: finalConfidence,
      reason,
      indicators,
      ai_analysis_id: params.aiAnalysisId,
      created_at: new Date().toISOString(),
    };

    return generatedSignal;
  } catch (error) {
    logger.error('신호 생성 중 에러 발생', {
      symbol: params.symbol,
      market: params.market,
      error,
    });
    return null;
  }
}
