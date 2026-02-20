import Big from 'big.js';
import type { SlippageParams } from '../types.js';

/**
 * 슬리피지 계산
 *
 * 3가지 모델 지원:
 * 1. Fixed: 고정 비율 (예: 0.05%)
 * 2. Linear: orderSize / avgVolume × bidAskSpread
 * 3. Square Root: sqrt(orderSize / avgVolume) × bidAskSpread (시장 충격 모델)
 *
 * @param params - 슬리피지 파라미터
 * @returns 슬리피지 비율 (%)
 */
export function calculateSlippage(params: SlippageParams): Big {
  const { model, orderSize, avgVolume, bidAskSpread, fixedPct, stressMultiplier } = params;
  const stress = new Big(stressMultiplier ?? 1.0);

  let baseSlippage: Big;

  switch (model) {
    case 'fixed':
      baseSlippage = new Big(fixedPct ?? 0.05); // 기본값 0.05%
      break;

    case 'linear': {
      if (avgVolume.lte(0)) {
        baseSlippage = new Big(0);
        break;
      }
      const ratio = orderSize.div(avgVolume);
      baseSlippage = ratio.times(bidAskSpread);
      break;
    }

    case 'sqrt': {
      if (avgVolume.lte(0)) {
        baseSlippage = new Big(0);
        break;
      }
      const ratio = orderSize.div(avgVolume);
      const sqrtRatio = Math.sqrt(ratio.toNumber());
      baseSlippage = new Big(sqrtRatio).times(bidAskSpread);
      break;
    }

    default:
      throw new Error(`알 수 없는 슬리피지 모델: ${model}`);
  }

  // 스트레스 모드: 기본 슬리피지에 배수 적용 (기본 1.0 = Normal)
  return baseSlippage.times(stress);
}

/**
 * 슬리피지를 적용한 실제 체결 가격 계산
 *
 * @param price - 기준 가격
 * @param slippagePct - 슬리피지 비율 (%)
 * @param side - 매수/매도
 * @returns 실제 체결 가격
 */
export function applySlippage(
  price: Big,
  slippagePct: Big,
  side: 'BUY' | 'SELL'
): Big {
  const slippageMultiplier = slippagePct.div(100);

  if (side === 'BUY') {
    // 매수: 가격 상승 (불리)
    return price.times(new Big(1).plus(slippageMultiplier));
  } else {
    // 매도: 가격 하락 (불리)
    return price.times(new Big(1).minus(slippageMultiplier));
  }
}

/**
 * 거래소별 슬리피지 프리셋
 */
export const SLIPPAGE_PRESETS: Record<
  string,
  Pick<SlippageParams, 'model' | 'fixedPct'>
> = {
  upbit: {
    model: 'fixed',
    fixedPct: 0.05, // 0.05%
  },
  binance: {
    model: 'fixed',
    fixedPct: 0.1, // 0.1%
  },
  kis: {
    model: 'sqrt', // 한국 주식: Square Root 모델
    fixedPct: 0.0, // 사용 안 함
  },
  yf: {
    model: 'sqrt', // 미국 주식: Square Root 모델
    fixedPct: 0.0,
  },
};
