import Big from 'big.js';
import { createLogger, nowIso } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';
import type { KISClient } from '../brokers/kis/client.js';
import type { UpbitClient } from '../brokers/upbit/client.js';
import type { OrderRequest, OrderResult } from '../brokers/types.js';
import type { ExecuteOrderParams, OrderExecutionResult } from './types.js';

const logger = createLogger('order-executor');

type InsertError = {
  code?: string;
  message?: string;
};

type TradeCostInfo = {
  feeAmount: string;
  taxAmount: string;
  source: 'BROKER' | 'UNAVAILABLE';
};

function isMissingCostColumnsError(error: InsertError | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST204' || error.code === '42703') return true;
  const message = error.message ?? '';
  return message.includes('fee_amount') || message.includes('tax_amount');
}

function toAmountString(value: string | undefined): string {
  if (!value || value.trim().length === 0) return '0';

  try {
    const parsed = new Big(value);
    return parsed.gt(0) ? parsed.toString() : '0';
  } catch {
    return '0';
  }
}

function resolveTradeCosts(orderResult: OrderResult): TradeCostInfo {
  return {
    feeAmount: toAmountString(orderResult.feeAmount),
    taxAmount: toAmountString(orderResult.taxAmount),
    source: orderResult.costSource ?? 'UNAVAILABLE',
  };
}

function emptyTradeCosts(): TradeCostInfo {
  return {
    feeAmount: '0',
    taxAmount: '0',
    source: 'UNAVAILABLE',
  };
}

/**
 * 주문 실행
 *
 * 브로커 클라이언트를 사용하여 실제 주문을 실행하고 결과를 trades 테이블에 저장합니다.
 */
export async function executeOrder(
  params: ExecuteOrderParams,
  clients: {
    KIS: KISClient;
    UPBIT: UpbitClient;
  },
): Promise<OrderExecutionResult> {
  const {
    symbol,
    broker,
    market,
    side,
    qty,
    price,
    orderType = 'market',
    dryRun = false,
    aceLogId,
  } = params;

  logger.info('주문 실행 시작', {
    symbol,
    broker,
    market,
    side,
    qty: qty.toString(),
    price: price?.toString(),
    orderType,
    dryRun,
    aceLogId,
  });

  try {
    // 1. 브로커 클라이언트 선택
    const client = clients[broker];
    if (!client) {
      throw new Error(`지원하지 않는 브로커: ${broker}`);
    }

    // 2. OrderRequest 생성
    const orderRequest: OrderRequest = {
      market,
      symbol,
      side,
      orderType: orderType.toUpperCase() as 'MARKET' | 'LIMIT',
      quantity: qty.toString(),
      price: price?.toString() ?? null,
      dryRun,
      metadata: {
        aceLogId,
      },
    };

    // 3. 주문 실행
    const orderResult: OrderResult = await client.placeOrder(orderRequest);

    logger.info('주문 실행 결과', {
      symbol,
      status: orderResult.status,
      orderId: orderResult.orderId,
      message: orderResult.message,
      dryRun: orderResult.dryRun,
    });

    // 4. trades 테이블에 저장
    let tradeId: string | undefined;

    if (orderResult.status === 'SUCCESS' || orderResult.dryRun) {
      const executedPrice = orderResult.executedPrice ?? orderResult.requestedPrice ?? '0';
      const costs = resolveTradeCosts(orderResult);

      tradeId = await saveTrade({
        symbol,
        broker,
        market,
        side,
        qty: orderResult.requestedQty,
        price: executedPrice,
        orderId: orderResult.orderId,
        status: orderResult.status === 'SUCCESS' ? 'filled' : 'simulated',
        dryRun: orderResult.dryRun,
        aceLogId,
        feeAmount: costs.feeAmount,
        taxAmount: costs.taxAmount,
        costs,
      });

      logger.info('거래 기록 저장 완료', {
        tradeId,
        symbol,
        feeAmount: costs.feeAmount,
        taxAmount: costs.taxAmount,
        costSource: costs.source,
      });
    } else {
      // 실패한 주문도 기록
      tradeId = await saveTrade({
        symbol,
        broker,
        market,
        side,
        qty: orderResult.requestedQty,
        price: orderResult.requestedPrice ?? '0',
        orderId: orderResult.orderId,
        status: 'failed',
        error: orderResult.message,
        dryRun: orderResult.dryRun,
        aceLogId,
        feeAmount: '0',
        taxAmount: '0',
        costs: emptyTradeCosts(),
      });

      logger.warn('거래 실패 기록 저장', {
        tradeId,
        symbol,
        error: orderResult.message,
      });
    }

    // 5. OrderExecutionResult 반환
    return {
      success: orderResult.status === 'SUCCESS',
      tradeId,
      orderId: orderResult.orderId,
      executedPrice: orderResult.executedPrice ?? orderResult.requestedPrice ?? undefined,
      executedQty: orderResult.executedQty ?? orderResult.requestedQty,
      error: orderResult.status !== 'SUCCESS' ? orderResult.message : undefined,
      dryRun: orderResult.dryRun,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('주문 실행 중 에러', {
      symbol,
      broker,
      error: errorMessage,
    });

    // 에러도 기록
    const tradeId = await saveTrade({
      symbol,
      broker,
      market,
      side,
      qty: qty.toString(),
      price: price?.toString() ?? '0',
      status: 'failed',
      error: errorMessage,
      dryRun,
      aceLogId,
      feeAmount: '0',
      taxAmount: '0',
      costs: emptyTradeCosts(),
    });

    return {
      success: false,
      tradeId,
      error: errorMessage,
      dryRun,
    };
  }
}

/**
 * trades 테이블에 거래 기록 저장
 */
async function saveTrade(params: {
  symbol: string;
  broker: string;
  market: string;
  side: string;
  qty: string;
  price: string;
  orderId?: string;
  status: 'filled' | 'failed' | 'simulated';
  error?: string;
  dryRun: boolean;
  aceLogId?: string;
  feeAmount?: string;
  taxAmount?: string;
  costs?: TradeCostInfo;
}): Promise<string> {
  const supabase = getSupabase();

  const basePayload = {
    symbol: params.symbol,
    broker: params.broker,
    market: params.market,
    side: params.side,
    qty: params.qty,
    price: params.price,
    order_id: params.orderId ?? null,
    status: params.status,
    error: params.error ?? null,
    executed_at: nowIso(),
    created_at: nowIso(),
    metadata: {
      dryRun: params.dryRun,
      aceLogId: params.aceLogId,
      costs: params.costs ?? emptyTradeCosts(),
    },
  };

  const payloadWithCosts = {
    ...basePayload,
    fee_amount: params.feeAmount ?? '0',
    tax_amount: params.taxAmount ?? '0',
  };

  let { data, error } = await supabase
    .from('trades')
    .insert(payloadWithCosts)
    .select('id')
    .single();

  if (error && isMissingCostColumnsError(error)) {
    logger.warn('trades 수수료/세금 컬럼 없음 - metadata로 저장', {
      symbol: params.symbol,
      error: error.message,
    });

    const retried = await supabase.from('trades').insert(basePayload).select('id').single();
    data = retried.data;
    error = retried.error;
  }

  if (error) {
    logger.error('거래 기록 저장 실패', {
      symbol: params.symbol,
      error: error.message,
    });
    throw new Error(`거래 기록 저장 실패: ${error.message}`);
  }

  if (!data?.id) {
    throw new Error('거래 ID 조회 실패');
  }

  return data.id;
}
