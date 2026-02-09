import Big from 'big.js';
import { DateTime } from 'luxon';
import type { Broker } from '../config/markets';
import { TRADING_CONFIG } from '../config/trading';
import type { BrokerClient, OrderRequest, OrderResult } from '../brokers/types';
import { markSystemGuardFailure, markSystemGuardSuccess } from '../db/guards';
import { enqueueNotificationEvent } from '../db/notifications';
import { insertTradeExecution, updateDailyStats, updateTradeExecution } from '../db/trades';
import type { Decision } from '../decision/types';

export type ExecuteOrdersParams = {
  decisions: Decision[];
  clients: Partial<Record<Broker, BrokerClient>>;
  dryRun?: boolean;
};

export type ExecutionItem = {
  decision: Decision;
  result: OrderResult | null;
  tradeExecutionId?: string;
  error?: string;
};

export type ExecuteOrdersResult = {
  total: number;
  attempted: number;
  success: number;
  failed: number;
  skipped: number;
  items: ExecutionItem[];
};

function buildOrderQuantity(params: {
  broker: Broker;
  currentPrice: number | null;
  action: Decision['action'];
}): string {
  if (params.action !== 'BUY' && params.action !== 'SELL') {
    return '0';
  }

  const price = params.currentPrice;
  if (!price || !Number.isFinite(price) || price <= 0) {
    return '1';
  }

  const notional = new Big(TRADING_CONFIG.maxTradeNotional);
  const px = new Big(price);

  if (params.broker === 'KIS') {
    const qty = notional.div(px).round(0, 0); // RoundDown
    return qty.gte(1) ? qty.toString() : '1';
  }

  const qty = notional.div(px);
  const minQty = new Big('0.00000001');
  return qty.gte(minQty) ? qty.toFixed(8) : minQty.toFixed(8);
}

function toOrderRequest(params: {
  decision: Decision & { action: 'BUY' | 'SELL' };
  quantity: string;
  price: number | null;
  dryRun: boolean;
}): OrderRequest {
  return {
    market: params.decision.market,
    symbol: params.decision.symbol,
    side: params.decision.action,
    orderType: 'MARKET',
    quantity: params.quantity,
    price: params.price !== null ? String(params.price) : null,
    reason: params.decision.reason,
    dryRun: params.dryRun,
    metadata: {
      aiAnalysisId: params.decision.aiAnalysisId,
      confidence: params.decision.confidence,
      aiDecision: params.decision.aiDecision,
    },
  };
}

function makeIdempotencyKey(decision: Decision): string {
  return `${decision.broker}:${decision.market}:${decision.symbol}:${decision.action}:${decision.aiAnalysisId}`;
}

function nowMinuteKey(): string {
  const dt = DateTime.now().toUTC().startOf('minute');
  const iso = dt.toISO();
  if (!iso) return String(dt.toMillis());
  return iso;
}

/**
 * Decision 목록을 브로커별로 실행하고 DB에 기록한다.
 */
export async function executeOrders(params: ExecuteOrdersParams): Promise<ExecuteOrdersResult> {
  const dryRun = params.dryRun ?? TRADING_CONFIG.dryRun;

  const items: ExecutionItem[] = [];
  let attempted = 0;
  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const decision of params.decisions) {
    if (decision.action === 'SKIP') {
      skipped += 1;
      items.push({
        decision,
        result: null,
        error: 'decision is SKIP',
      });
      continue;
    }

    const client = params.clients[decision.broker];
    if (!client) {
      failed += 1;
      const err = `broker client not found: ${decision.broker}`;

      await markSystemGuardFailure({ message: err });
      await enqueueNotificationEvent({
        sourceService: 'trade-executor',
        eventType: 'TRADE_EXECUTION_ERROR',
        level: 'ERROR',
        market: decision.market,
        title: '주문 실행 오류',
        message: `${decision.symbol} ${decision.action} 실패: ${err}`,
        dedupeKey: `exec-error:${decision.broker}:${decision.symbol}:${nowMinuteKey()}`,
        payload: { decision },
      });

      items.push({ decision, result: null, error: err });
      continue;
    }

    attempted += 1;
    let tradeExecutionId: string | undefined;

    try {
      let marketPrice: number | null = null;
      let marketPriceError: string | null = null;
      try {
        marketPrice = await client.getCurrentPrice({
          market: decision.market,
          symbol: decision.symbol,
        });
      } catch (priceError: unknown) {
        marketPriceError = priceError instanceof Error ? priceError.message : String(priceError);
      }

      if (marketPrice === null || !Number.isFinite(marketPrice) || marketPrice <= 0) {
        skipped += 1;
        const reason = marketPriceError ?? '현재가 미확보';

        await enqueueNotificationEvent({
          sourceService: 'trade-executor',
          eventType: 'PRICE_MISSING_SKIP',
          level: 'WARNING',
          market: decision.market,
          title: '주문 스킵(현재가 없음)',
          message: `${decision.symbol} ${decision.action} 스킵: ${reason}`,
          dedupeKey: `price-missing:${decision.broker}:${decision.symbol}:${nowMinuteKey()}`,
          payload: { decision, reason },
        });

        items.push({
          decision,
          result: {
            broker: decision.broker,
            market: decision.market,
            symbol: decision.symbol,
            side: decision.action,
            orderType: 'MARKET',
            requestedQty: '0',
            requestedPrice: null,
            status: 'SKIPPED',
            dryRun,
            message: `현재가 미확보로 주문 스킵 (${reason})`,
          },
          error: reason,
        });
        continue;
      }

      const quantity = buildOrderQuantity({
        broker: decision.broker,
        currentPrice: marketPrice,
        action: decision.action,
      });

      const request = toOrderRequest({
        decision: decision as Decision & { action: 'BUY' | 'SELL' },
        quantity,
        price: marketPrice,
        dryRun,
      });
      const idempotencyKey = makeIdempotencyKey(decision);

      tradeExecutionId = await insertTradeExecution({
        broker: decision.broker,
        symbol: decision.symbol,
        side: decision.action,
        orderType: request.orderType,
        quantity: request.quantity,
        price: request.price,
        status: 'PENDING',
        decisionReason: decision.reason,
        aiAnalysisId: decision.aiAnalysisId,
        idempotencyKey,
        metadata: {
          dryRun,
          confidence: decision.confidence,
          aiDecision: decision.aiDecision,
          idempotencyKey,
        },
      });

      const orderResult = await client.placeOrder(request);

      if (orderResult.status === 'SUCCESS') {
        await updateTradeExecution({
          id: tradeExecutionId,
          status: 'SUCCESS',
          orderId: orderResult.orderId,
          executedQty: orderResult.executedQty ?? request.quantity,
          executedPrice: orderResult.executedPrice ?? request.price,
          decisionReason: orderResult.message,
          metadata: { request, orderResult, idempotencyKey },
        });

        await updateDailyStats({
          side: decision.action,
          quantity: orderResult.executedQty ?? request.quantity,
          price: orderResult.executedPrice ?? request.price ?? '0',
          success: true,
        });

        await markSystemGuardSuccess();
        await enqueueNotificationEvent({
          sourceService: 'trade-executor',
          eventType: 'TRADE_FILLED',
          level: 'INFO',
          market: decision.market,
          title: `${decision.action} 체결`,
          message: `${decision.symbol} ${decision.action} qty=${orderResult.executedQty ?? request.quantity} price=${orderResult.executedPrice ?? request.price ?? 'MKT'}`,
          dedupeKey: `trade-filled:${decision.broker}:${decision.symbol}:${decision.aiAnalysisId}:${decision.action}`,
          payload: { decision, orderResult },
        });

        success += 1;
      } else if (orderResult.status === 'SKIPPED') {
        await updateTradeExecution({
          id: tradeExecutionId,
          status: 'SUCCESS',
          orderId: orderResult.orderId,
          executedQty: orderResult.executedQty ?? request.quantity,
          executedPrice: orderResult.executedPrice ?? request.price,
          decisionReason: orderResult.message,
          metadata: { request, orderResult, skipped: true, idempotencyKey },
        });

        skipped += 1;
      } else {
        await updateTradeExecution({
          id: tradeExecutionId,
          status: 'FAILED',
          orderId: orderResult.orderId,
          executedQty: orderResult.executedQty ?? request.quantity,
          executedPrice: orderResult.executedPrice ?? request.price,
          decisionReason: orderResult.message,
          metadata: { request, orderResult, idempotencyKey },
        });

        await updateDailyStats({
          side: decision.action,
          quantity: orderResult.executedQty ?? request.quantity,
          price: orderResult.executedPrice ?? request.price ?? '0',
          success: false,
        });

        await markSystemGuardFailure({ message: orderResult.message });
        await enqueueNotificationEvent({
          sourceService: 'trade-executor',
          eventType: 'TRADE_FAILED',
          level: 'ERROR',
          market: decision.market,
          title: `${decision.action} 실패`,
          message: `${decision.symbol} ${decision.action} 실패: ${orderResult.message}`,
          dedupeKey: `trade-failed:${decision.broker}:${decision.symbol}:${decision.aiAnalysisId}:${nowMinuteKey()}`,
          payload: { decision, orderResult },
        });

        failed += 1;
      }

      items.push({
        decision,
        result: orderResult,
        tradeExecutionId,
      });
    } catch (error: unknown) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);

      if (tradeExecutionId) {
        await updateTradeExecution({
          id: tradeExecutionId,
          status: 'FAILED',
          decisionReason: message,
          metadata: { error: message, idempotencyKey: makeIdempotencyKey(decision) },
        });
      }

      await markSystemGuardFailure({ message });
      await enqueueNotificationEvent({
        sourceService: 'trade-executor',
        eventType: 'TRADE_EXECUTION_ERROR',
        level: 'ERROR',
        market: decision.market,
        title: '주문 실행 예외',
        message: `${decision.symbol} ${decision.action} 예외: ${message}`,
        dedupeKey: `exec-error:${decision.broker}:${decision.symbol}:${nowMinuteKey()}`,
        payload: { decision, error: message },
      });

      items.push({
        decision,
        result: null,
        tradeExecutionId,
        error: message,
      });
    }
  }

  return {
    total: params.decisions.length,
    attempted,
    success,
    failed,
    skipped,
    items,
  };
}
