import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import { calculateWeightedConfidence, type IndicatorScore } from '@workspace/trading-utils';
import type { TechnicalSnapshot, ConfidenceBlendResult } from './types.js';

const logger = createLogger('confidence-engine');

/**
 * 기술적 신뢰도 계산
 *
 * 기술적 지표들을 종합하여 0~1 사이의 신뢰도를 계산합니다.
 *
 * 가중치:
 * - 이동평균: 25%
 * - MACD: 20%
 * - RSI: 15%
 * - 거래량: 20%
 * - 지지/저항: 20%
 *
 * @param snapshot - 기술적 지표 스냅샷
 * @param direction - 매매 방향 ('BUY' | 'SELL')
 * @returns 기술적 신뢰도 (0~1)
 */
export function calculateTechnicalConfidence(
  snapshot: TechnicalSnapshot,
  direction: 'BUY' | 'SELL'
): number {
  const indicators: IndicatorScore[] = [];

  // 1. 이동평균 신호 (25%)
  if (snapshot.sma20 && snapshot.ema20) {
    const currentPrice = snapshot.currentPrice;
    const sma20 = snapshot.sma20;
    const ema20 = snapshot.ema20;

    let maScore = 0;

    if (direction === 'BUY') {
      // 매수: 현재가 > EMA20 > SMA20 (강한 상승 추세)
      if (currentPrice.gt(ema20) && ema20.gt(sma20)) {
        maScore = 1.0;
      } else if (currentPrice.gt(sma20)) {
        maScore = 0.6;
      } else {
        maScore = 0.2;
      }
    } else {
      // 매도: 현재가 < EMA20 < SMA20 (강한 하락 추세)
      if (currentPrice.lt(ema20) && ema20.lt(sma20)) {
        maScore = 1.0;
      } else if (currentPrice.lt(sma20)) {
        maScore = 0.6;
      } else {
        maScore = 0.2;
      }
    }

    indicators.push({
      name: 'moving_average',
      score: maScore,
      weight: 0.25,
    });

    logger.debug('이동평균 신뢰도', {
      direction,
      currentPrice: currentPrice.toString(),
      sma20: sma20.toString(),
      ema20: ema20.toString(),
      score: maScore,
    });
  }

  // 2. MACD 신호 (20%)
  if (snapshot.macd) {
    const { macd, signal, histogram } = snapshot.macd;

    let macdScore = 0;

    if (direction === 'BUY') {
      // 매수: MACD > Signal (상승 모멘텀)
      if (macd.gt(signal) && histogram.gt(0)) {
        macdScore = 1.0;
      } else if (macd.gt(signal)) {
        macdScore = 0.6;
      } else {
        macdScore = 0.2;
      }
    } else {
      // 매도: MACD < Signal (하락 모멘텀)
      if (macd.lt(signal) && histogram.lt(0)) {
        macdScore = 1.0;
      } else if (macd.lt(signal)) {
        macdScore = 0.6;
      } else {
        macdScore = 0.2;
      }
    }

    indicators.push({
      name: 'macd',
      score: macdScore,
      weight: 0.2,
    });

    logger.debug('MACD 신뢰도', {
      direction,
      macd: macd.toString(),
      signal: signal.toString(),
      histogram: histogram.toString(),
      score: macdScore,
    });
  }

  // 3. RSI 신호 (15%)
  if (snapshot.rsi) {
    const { value, overbought, oversold } = snapshot.rsi;

    let rsiScore = 0;

    if (direction === 'BUY') {
      // 매수: RSI 30~70 (정상 범위)
      if (oversold) {
        rsiScore = 0.9; // 과매도 구간에서 반등 기회
      } else if (overbought) {
        rsiScore = 0.1; // 과매수 구간에서는 매수 부적절
      } else {
        rsiScore = 0.6; // 정상 범위
      }
    } else {
      // 매도: RSI 70 이상 (과매수)
      if (overbought) {
        rsiScore = 0.9; // 과매수 구간에서 조정 가능성
      } else if (oversold) {
        rsiScore = 0.1; // 과매도 구간에서는 매도 부적절
      } else {
        rsiScore = 0.6; // 정상 범위
      }
    }

    indicators.push({
      name: 'rsi',
      score: rsiScore,
      weight: 0.15,
    });

    logger.debug('RSI 신뢰도', {
      direction,
      value: value.toString(),
      overbought,
      oversold,
      score: rsiScore,
    });
  }

  // 4. 거래량 신호 (20%)
  if (snapshot.volume) {
    const { isHighVolume, volumeRatio } = snapshot.volume;

    let volumeScore = 0;

    if (isHighVolume) {
      // 높은 거래량은 신호 강화
      volumeScore = 0.9;
    } else if (volumeRatio.gt(0.8)) {
      // 평균 이상 거래량
      volumeScore = 0.7;
    } else {
      // 낮은 거래량은 신뢰도 감소
      volumeScore = 0.4;
    }

    indicators.push({
      name: 'volume',
      score: volumeScore,
      weight: 0.2,
    });

    logger.debug('거래량 신뢰도', {
      volumeRatio: volumeRatio.toString(),
      isHighVolume,
      score: volumeScore,
    });
  }

  // 5. 지지/저항 신호 (20%)
  if (snapshot.supportResistance.length > 0) {
    const currentPrice = snapshot.currentPrice;
    let srScore = 0.5; // 기본값

    // 현재가 근처의 지지/저항 찾기
    const nearbyLevels = snapshot.supportResistance.filter((level) => {
      const priceDiff = currentPrice.minus(level.price).abs();
      const priceDiffPct = priceDiff.div(currentPrice);
      return priceDiffPct.lt(0.02); // 2% 이내
    });

    if (nearbyLevels.length > 0) {
      if (direction === 'BUY') {
        // 매수: 지지선 근처에서 반등 가능성
        const support = nearbyLevels.find((l) => l.type === 'support');
        if (support) {
          srScore = 0.8 + support.strength * 0.2; // 0.8~1.0
        }
      } else {
        // 매도: 저항선 근처에서 조정 가능성
        const resistance = nearbyLevels.find((l) => l.type === 'resistance');
        if (resistance) {
          srScore = 0.8 + resistance.strength * 0.2; // 0.8~1.0
        }
      }
    }

    indicators.push({
      name: 'support_resistance',
      score: srScore,
      weight: 0.2,
    });

    logger.debug('지지/저항 신뢰도', {
      direction,
      nearbyLevelsCount: nearbyLevels.length,
      score: srScore,
    });
  }

  // 지표가 하나도 없으면 0.5 반환 (중립)
  if (indicators.length === 0) {
    logger.warn('기술적 지표 없음 - 중립 신뢰도 반환');
    return 0.5;
  }

  // 가중치 정규화 (일부 지표만 있을 경우 가중치 합이 1.0이 되도록 조정)
  const totalWeight = indicators.reduce((sum, indicator) => sum + indicator.weight, 0);
  const normalizedIndicators = indicators.map((indicator) => ({
    ...indicator,
    weight: indicator.weight / totalWeight,
  }));

  // 가중 평균 계산
  const technicalConfidence = calculateWeightedConfidence(normalizedIndicators);

  logger.info('기술적 신뢰도 계산 완료', {
    direction,
    indicatorsCount: indicators.length,
    technicalConfidence,
  });

  return technicalConfidence;
}

/**
 * AI + 기술적 신뢰도 블렌딩
 *
 * AI 신뢰도와 기술적 신뢰도를 블렌딩하여 최종 신뢰도를 계산합니다.
 *
 * 블렌딩 비율:
 * - AI: 60%
 * - 기술적: 40%
 *
 * @param params - 블렌딩 파라미터
 * @returns 블렌딩 결과
 */
export function blendConfidence(params: {
  aiConfidence: number;
  technicalConfidence: number;
  aiWeight?: number;
  technicalWeight?: number;
}): ConfidenceBlendResult {
  const aiWeight = params.aiWeight ?? 0.6;
  const technicalWeight = params.technicalWeight ?? 0.4;

  // 최종 신뢰도 = AI * 0.6 + 기술적 * 0.4
  const finalConfidence = aiWeight * params.aiConfidence + technicalWeight * params.technicalConfidence;

  logger.info('신뢰도 블렌딩 완료', {
    aiConfidence: params.aiConfidence,
    technicalConfidence: params.technicalConfidence,
    finalConfidence,
    aiWeight,
    technicalWeight,
  });

  return {
    aiConfidence: params.aiConfidence,
    technicalConfidence: params.technicalConfidence,
    finalConfidence: Math.max(0, Math.min(1, finalConfidence)), // 0~1 범위로 클램핑
    breakdown: {
      aiWeight,
      technicalWeight,
      adjustments: {},
    },
  };
}
