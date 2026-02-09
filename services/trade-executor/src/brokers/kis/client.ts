import Big from 'big.js';
import { env, requireEnv } from '@workspace/shared-utils';
import { TokenManager } from '@workspace/kis-auth';
import { TRADING_CONFIG } from '../../config/trading.js';
import type { BrokerClient, OrderRequest, OrderResult } from '../types.js';

type KisConfig = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  accountNo: string;
  accountProductCd: string;
  trPrefix: 'T' | 'V';
};

type KisPriceResponse = {
  output?: {
    stck_prpr?: string;
  };
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
};

type KisOrderResponse = {
  rt_cd?: string;
  msg_cd?: string;
  msg1?: string;
  output?: {
    ODNO?: string;
    KRX_FWDG_ORD_ORGNO?: string;
    ORD_TMD?: string;
  };
};

function toNumericString(value: string): string {
  return new Big(value).toString();
}

function getKisConfig(): KisConfig {
  const kisEnv = (env('KIS_ENV') ?? 'REAL').toUpperCase();
  const isPaper = kisEnv === 'PAPER' || kisEnv === 'MOCK' || kisEnv === 'SIM';

  return {
    baseUrl: isPaper ? requireEnv('KIS_PAPER_BASE_URL') : requireEnv('KIS_REAL_BASE_URL'),
    appKey: requireEnv('KIS_APP_KEY'),
    appSecret: requireEnv('KIS_APP_SECRET'),
    accountNo: requireEnv('KIS_ACCOUNT_NO'),
    accountProductCd: requireEnv('KIS_ACCOUNT_PRODUCT_CD'),
    trPrefix: isPaper ? 'V' : 'T',
  };
}

function toKisOrderType(orderType: OrderRequest['orderType']): '00' | '01' {
  return orderType === 'LIMIT' ? '00' : '01';
}

function toOrderTrId(side: OrderRequest['side']): string {
  const cfg = getKisConfig();
  // 실전: TTTC0802U(매수), TTTC0801U(매도) / 모의: VTTC0802U, VTTC0801U
  return side === 'BUY' ? `${cfg.trPrefix}TTC0802U` : `${cfg.trPrefix}TTC0801U`;
}

export class KISClient implements BrokerClient {
  public readonly broker = 'KIS' as const;
  private readonly tokenManager = new TokenManager('trade-executor');

  async getCurrentPrice(params: {
    market: OrderRequest['market'];
    symbol: string;
  }): Promise<number | null> {
    const cfg = getKisConfig();

    if (params.market !== 'KR') {
      return null;
    }

    const token = await this.tokenManager.getToken();

    const url = new URL(`${cfg.baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price`);
    url.searchParams.set('FID_COND_MRKT_DIV_CODE', 'J');
    url.searchParams.set('FID_INPUT_ISCD', params.symbol);

    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${token}`,
        appkey: cfg.appKey,
        appsecret: cfg.appSecret,
        tr_id: 'FHKST01010100',
        custtype: 'P',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`KIS 현재가 조회 실패(${res.status}): ${text}`);
    }

    const body = (await res.json()) as KisPriceResponse;
    const priceStr = body.output?.stck_prpr;

    if (!priceStr) {
      return null;
    }

    const price = Number(priceStr);
    return Number.isFinite(price) ? price : null;
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    const cfg = getKisConfig();

    const dryRun = request.dryRun ?? TRADING_CONFIG.dryRun;
    const requestedPrice = request.price ?? null;

    if (request.market !== 'KR') {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice,
        status: 'SKIPPED',
        dryRun,
        message: `KIS는 KR 시장만 지원 (market=${request.market})`,
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
        requestedPrice,
        status: 'SKIPPED',
        dryRun: true,
        message: 'DRY_RUN enabled: order not sent',
      };
    }

    if (request.orderType === 'LIMIT' && !request.price) {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: request.quantity,
        requestedPrice,
        status: 'FAILED',
        dryRun,
        message: 'LIMIT 주문은 price가 필요합니다.',
      };
    }

    const token = await this.tokenManager.getToken();
    const trId = toOrderTrId(request.side);
    const ordDvsn = toKisOrderType(request.orderType);

    const quantity = toNumericString(request.quantity);
    const orderPrice = request.orderType === 'MARKET' ? '0' : toNumericString(request.price ?? '0');

    const url = `${cfg.baseUrl}/uapi/domestic-stock/v1/trading/order-cash`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: cfg.appKey,
        appsecret: cfg.appSecret,
        tr_id: trId,
        custtype: 'P',
      },
      body: JSON.stringify({
        CANO: cfg.accountNo,
        ACNT_PRDT_CD: cfg.accountProductCd,
        PDNO: request.symbol,
        ORD_DVSN: ordDvsn,
        ORD_QTY: quantity,
        ORD_UNPR: orderPrice,
      }),
    });

    const bodyText = await res.text();
    let body: KisOrderResponse = {};

    try {
      body = JSON.parse(bodyText) as KisOrderResponse;
    } catch {
      body = {};
    }

    if (!res.ok) {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: quantity,
        requestedPrice: requestedPrice ?? null,
        status: 'FAILED',
        dryRun,
        message: `KIS 주문 실패(${res.status}): ${bodyText}`,
        raw: bodyText,
      };
    }

    if (body.rt_cd !== '0') {
      return {
        broker: this.broker,
        market: request.market,
        symbol: request.symbol,
        side: request.side,
        orderType: request.orderType,
        requestedQty: quantity,
        requestedPrice: requestedPrice ?? null,
        status: 'FAILED',
        dryRun,
        message: `KIS 주문 거절(${body.msg_cd ?? 'UNKNOWN'}): ${body.msg1 ?? 'unknown error'}`,
        raw: body,
      };
    }

    return {
      broker: this.broker,
      market: request.market,
      symbol: request.symbol,
      side: request.side,
      orderType: request.orderType,
      requestedQty: quantity,
      requestedPrice: requestedPrice ?? null,
      status: 'SUCCESS',
      dryRun,
      orderId: body.output?.ODNO,
      message: 'KIS 주문 접수 성공',
      raw: body,
    };
  }
}
