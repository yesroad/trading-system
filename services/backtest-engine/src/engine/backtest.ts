import Big from 'big.js';
import { createLogger } from '@workspace/shared-utils';
import type {
  Strategy,
  BacktestConfig,
  BacktestResult,
  Trade,
  Position,
  EquityPoint,
  Candle,
} from '../types.js';
import { loadCandles, calculateAvgVolume, estimateBidAskSpread } from '../data/loader.js';
import { calculateSlippage, applySlippage } from '../models/slippage.js';
import { calculateMetrics, calculateDrawdowns } from '../metrics/calculator.js';

const logger = createLogger('backtest-engine');

/**
 * 백테스트 실행
 *
 * @param strategy - 전략
 * @param config - 백테스트 설정
 * @returns 백테스트 결과
 */
export async function runBacktest(
  strategy: Strategy,
  config: BacktestConfig
): Promise<BacktestResult> {
  logger.info('백테스트 시작', {
    strategy: strategy.name,
    symbol: config.symbol,
    startDate: config.startDate,
    endDate: config.endDate,
  });

  // 1. 캔들 데이터 로드
  const source = determineSource(config.symbol);
  const candles = await loadCandles({
    symbol: config.symbol,
    startDate: config.startDate,
    endDate: config.endDate,
    source,
  });

  if (candles.length === 0) {
    throw new Error('캔들 데이터가 없습니다');
  }

  logger.info('캔들 데이터 로드 완료', { count: candles.length });

  // 2. 백테스트 상태 초기화
  let capital = config.initialCapital;
  let position: Position | null = null;
  const trades: Trade[] = [];
  const equity: EquityPoint[] = [];

  // 3. 캔들 순회
  for (let i = 0; i < candles.length; i++) {
    const currentCandle = candles[i]!;
    const historicalCandles = candles.slice(0, i + 1); // 현재까지의 캔들

    // 전략 시그널 생성
    const signal = strategy.generateSignal(historicalCandles, position);

    // 주문 실행
    if (signal.action === 'BUY' && !position) {
      // 매수
      const trade = await executeBuy({
        candle: currentCandle,
        capital,
        config,
        historicalCandles,
        qty: signal.qty,
      });

      if (trade) {
        trades.push(trade);
        capital = capital.minus(trade.qty.times(trade.price)).minus(trade.commission);

        position = {
          symbol: config.symbol,
          qty: trade.qty,
          avgPrice: trade.price,
          unrealizedPnL: new Big(0),
          entryTime: trade.timestamp,
        };

        logger.debug('매수 실행', {
          price: trade.price.toString(),
          qty: trade.qty.toString(),
          capital: capital.toString(),
        });
      }
    } else if (signal.action === 'SELL' && position) {
      // 매도
      const trade = await executeSell({
        candle: currentCandle,
        position,
        config,
        historicalCandles,
      });

      if (trade) {
        trades.push(trade);
        capital = capital.plus(trade.qty.times(trade.price)).minus(trade.commission);

        // 실현 손익 계산
        const realizedPnL = trade.qty
          .times(trade.price)
          .minus(trade.qty.times(position.avgPrice))
          .minus(trade.commission)
          .minus(trades[trades.length - 2]?.commission ?? new Big(0)); // 매수 수수료

        trade.realizedPnL = realizedPnL;

        logger.debug('매도 실행', {
          price: trade.price.toString(),
          realizedPnL: realizedPnL.toString(),
          capital: capital.toString(),
        });

        position = null;
      }
    }

    // 미실현 손익 업데이트
    let currentEquity = capital;
    if (position) {
      const unrealizedPnL = position.qty
        .times(currentCandle.close)
        .minus(position.qty.times(position.avgPrice));
      position.unrealizedPnL = unrealizedPnL;
      currentEquity = capital.plus(position.qty.times(currentCandle.close));
    }

    // 자본 곡선 추적
    equity.push({
      timestamp: currentCandle.candleTime,
      equity: currentEquity,
    });
  }

  // 4. 마지막 포지션이 열려있으면 강제 청산
  if (position) {
    const lastCandle = candles[candles.length - 1]!;
    const sellTrade = await executeSell({
      candle: lastCandle,
      position,
      config,
      historicalCandles: candles,
    });

    if (sellTrade) {
      trades.push(sellTrade);
      capital = capital.plus(sellTrade.qty.times(sellTrade.price)).minus(sellTrade.commission);

      const buyTrade = trades[trades.length - 2];
      const realizedPnL = sellTrade.qty
        .times(sellTrade.price)
        .minus(sellTrade.qty.times(position.avgPrice))
        .minus(sellTrade.commission)
        .minus(buyTrade?.commission ?? new Big(0));

      sellTrade.realizedPnL = realizedPnL;

      logger.info('마지막 포지션 강제 청산', {
        price: sellTrade.price.toString(),
        realizedPnL: realizedPnL.toString(),
      });
    }
  }

  // 5. 성과 지표 계산
  const metrics = calculateMetrics(trades, equity, config.initialCapital);
  const drawdowns = calculateDrawdowns(equity);

  const result: BacktestResult = {
    strategy: strategy.name,
    symbol: config.symbol,
    startDate: config.startDate,
    endDate: config.endDate,
    initialCapital: config.initialCapital,
    finalCapital: capital,
    totalReturn: metrics.totalReturn,
    metrics,
    trades,
    equity,
    drawdowns,
  };

  logger.info('백테스트 완료', {
    totalReturn: `${metrics.totalReturn.toFixed(2)}%`,
    sharpeRatio: metrics.sharpeRatio.toFixed(2),
    maxDrawdown: `${metrics.maxDrawdown.toFixed(2)}%`,
    totalTrades: metrics.totalTrades,
  });

  return result;
}

/**
 * 매수 주문 실행
 */
async function executeBuy(params: {
  candle: Candle;
  capital: Big;
  config: BacktestConfig;
  historicalCandles: Candle[];
  qty?: Big;
}): Promise<Trade | null> {
  const { candle, capital, config, historicalCandles, qty } = params;

  // 주문 수량 계산
  let orderQty = qty;
  if (!orderQty) {
    // 최대 포지션 크기 제한 (기본: 자본의 95%)
    const maxPositionSize = config.maxPositionSize ?? new Big(0.95);
    const availableCapital = capital.times(maxPositionSize);
    orderQty = availableCapital.div(candle.close);
  }

  if (orderQty.lte(0)) {
    logger.warn('주문 수량 0 이하', { orderQty: orderQty.toString() });
    return null;
  }

  // 슬리피지 계산
  const avgVolume = calculateAvgVolume(historicalCandles);
  const bidAskSpread = estimateBidAskSpread(historicalCandles);
  const orderSize = orderQty.times(candle.close);

  const slippagePct = calculateSlippage({
    ...config.slippage,
    orderSize,
    avgVolume,
    bidAskSpread,
  });

  // 슬리피지 적용 (매수는 불리한 가격)
  const executionPrice = applySlippage(candle.close, slippagePct, 'BUY');

  // 수수료 계산
  const commission = orderQty.times(executionPrice).times(config.commission / 100);

  return {
    symbol: config.symbol,
    side: 'BUY',
    qty: orderQty,
    price: executionPrice,
    timestamp: candle.candleTime,
    commission,
    slippage: slippagePct,
  };
}

/**
 * 매도 주문 실행
 */
async function executeSell(params: {
  candle: Candle;
  position: Position;
  config: BacktestConfig;
  historicalCandles: Candle[];
}): Promise<Trade | null> {
  const { candle, position, config, historicalCandles } = params;

  // 슬리피지 계산
  const avgVolume = calculateAvgVolume(historicalCandles);
  const bidAskSpread = estimateBidAskSpread(historicalCandles);
  const orderSize = position.qty.times(candle.close);

  const slippagePct = calculateSlippage({
    ...config.slippage,
    orderSize,
    avgVolume,
    bidAskSpread,
  });

  // 슬리피지 적용 (매도는 불리한 가격)
  const executionPrice = applySlippage(candle.close, slippagePct, 'SELL');

  // 수수료 계산
  const commission = position.qty.times(executionPrice).times(config.commission / 100);

  return {
    symbol: config.symbol,
    side: 'SELL',
    qty: position.qty,
    price: executionPrice,
    timestamp: candle.candleTime,
    commission,
    slippage: slippagePct,
  };
}

/**
 * 심볼로부터 데이터 소스 결정
 */
function determineSource(symbol: string): 'upbit' | 'kis' | 'yf' {
  if (symbol.startsWith('KRW-')) {
    return 'upbit';
  } else if (/^\d{6}$/.test(symbol)) {
    // 6자리 숫자 (한국 종목 코드)
    return 'kis';
  } else {
    return 'yf'; // 미국 주식 (티커)
  }
}
