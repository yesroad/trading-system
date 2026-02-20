import { createHash } from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import Big from 'big.js';
import { requireEnv } from '@workspace/shared-utils';
import { TRADING_CONFIG } from '../../config/trading.js';
import type { BrokerClient, OrderRequest, OrderResult } from '../types.js';

const BASE_URL = 'https://api.upbit.com/v1';

type UpbitTickerRow = {
  trade_price?: number;
};

type UpbitOrderResponse = {
  uuid?: string;
  error?: {
    name?: string;
    message?: string;
  };
};

function createAuthToken(payloadParams?: Record<string, string>): string {
  const accessKey = requireEnv('UPBIT_ACCESS_KEY');
  const secretKey = requireEnv('UPBIT_SECRET_KEY');

  const payload: Record<string, string> = {
    access_key: accessKey,
    nonce: uuidv4(),
  };

  if (payloadParams && Object.keys(payloadParams).length > 0) {
    const qs = new URLSearchParams(payloadParams).toString();
    const queryHash = createHash('sha512').update(qs, 'utf-8').digest('hex');

    payload.query_hash = queryHash;
    payload.query_hash_alg = 'SHA512';
  }

  return jwt.sign(payload, secretKey);
}

export class UpbitClient implements BrokerClient {
  public readonly broker = 'UPBIT' as const;

  async getCurrentPrice(params: {
    market: OrderRequest['market'];
    symbol: string;
  }): Promise<number | null> {
    if (params.market !== 'CRYPTO') return null;

    const marketCode = params.symbol.startsWith('KRW-') ? params.symbol : `KRW-${params.symbol}`;

    const res = await fetch(`${BASE_URL}/ticker?markets=${encodeURIComponent(marketCode)}`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upbit 현재가 조회 실패(${res.status}): ${text}`);
    }

    const data = (await res.json()) as UpbitTickerRow[];
    const row = Array.isArray(data) ? data[0] : null;
    const tradePrice = row?.trade_price;

    return typeof tradePrice === 'number' && Number.isFinite(tradePrice) ? tradePrice : null;
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const dryRun = request.dryRun ?? TRADING_CONFIG.dryRun;

    if (request.market !== 'CRYPTO') {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice: request.price ?? null,
        status: 'SKIPPED',
        dryRun,
        message: `UPBIT는 CRYPTO 시장만 지원 (market=${request.market})`,
      };
    }

    if (dryRun) {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice: request.price ?? null,
        status: 'SKIPPED',
        dryRun: true,
        message: 'DRY_RUN enabled: order not sent',
      };
    }

    const marketCode = request.symbol.startsWith('KRW-') ? request.symbol : `KRW-${request.symbol}`;

    let params: Record<string, string>;

    if (request.side === 'BUY') {
      // 시장가 매수: ord_type=price, price=KRW 주문금액
      const price = request.price ? new Big(request.price) : new Big(0);
      const qty = new Big(request.quantity);
      const total = price.times(qty);

      params = {
        market: marketCode,
        side: 'bid',
        ord_type: 'price',
        price: total.toString(),
      };
    } else {
      // 시장가 매도: ord_type=market, volume=수량
      params = {
        market: marketCode,
        side: 'ask',
        ord_type: 'market',
        volume: new Big(request.quantity).toString(),
      };
    }

    const token = createAuthToken(params);

    const res = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    const text = await res.text();
    let body: UpbitOrderResponse = {};

    try {
      body = JSON.parse(text) as UpbitOrderResponse;
    } catch {
      body = {};
    }

    if (!res.ok) {
      const msg = body.error?.message ?? text;
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice: request.price ?? null,
        status: 'FAILED',
        dryRun,
        message: `Upbit 주문 실패(${res.status}): ${msg}`,
        raw: body,
      };
    }

    const orderId = body.uuid;
    if (!orderId) {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice: request.price ?? null,
        status: 'FAILED',
        dryRun,
        message: 'Upbit 주문 응답에 uuid가 없습니다.',
        raw: body,
      };
    }

    return {
      broker: this.broker,
      market: request.market,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType,
      requestedQty: request.quantity,
      requestedPrice: request.price ?? null,
      status: 'SUCCESS',
      dryRun,
      orderId,
      message: 'Upbit 주문 접수 성공',
      raw: body,
    };
  }
}
