import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import Big from 'big.js';
import jwt from 'jsonwebtoken';
import { createLogger, createBackoff, envBoolean, envNumber, requireEnv, sleep as defaultSleep } from '@workspace/shared-utils';
import { getSupabase } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';

const logger = createLogger('liquidator');

/** Upbit 잔고 API row */
export type UpbitBalanceRow = {
  currency: string;
  balance: string;
  locked: string;
  avg_buy_price: string;
};

/** 주문 결과 (placeMarketSell 반환) */
export type SellResult = {
  success: boolean;
  orderId?: string;
  message: string;
};

/** 심볼별 청산 결과 */
export type LiquidatePositionResult = {
  symbol: string;
  requestedQty: string;
  success: boolean;
  orderId?: string;
  error?: string;
  attempts: number;
  dryRun: boolean;
};

/** 전체 청산 결과 요약 */
export type LiquidateAllResult = {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  results: LiquidatePositionResult[];
  dryRun: boolean;
};

/** 청산 옵션 */
export type LiquidateOptions = {
  /** DRY_RUN: 실제 주문 미발행 */
  dryRun?: boolean;
  /** 청산 비율 (0.0~1.0), 기본 1.0 */
  liquidatePct?: number;
  /** 최소 청산 수량 (이 미만이면 skipped) */
  minQty?: string;
};

/** 의존성 주입 인터페이스 (테스트 교체 가능) */
export type LiquidatorDeps = {
  /** Upbit 잔고 조회 */
  fetchBalances: () => Promise<UpbitBalanceRow[]>;
  /** Upbit 시장가 매도 주문 */
  placeMarketSell: (symbol: string, qty: string) => Promise<SellResult>;
  /** 청산 결과 DB 저장 */
  saveRecord: (record: LiquidatePositionResult) => Promise<void>;
  /** 알림 발송 */
  notify: (message: string, details: Record<string, unknown>) => Promise<void>;
  /** 백오프용 sleep (테스트에서 즉시 처리) */
  sleep?: (ms: number) => Promise<void>;
};

// ─── 환경변수 ────────────────────────────────────────────────────────────────

const LIQUIDATE_PCT = Math.min(1, Math.max(0, envNumber('LIQUIDATE_PCT', 1.0) ?? 1.0));
const LIQUIDATE_MIN_QTY = envNumber('LIQUIDATE_MIN_QTY', 0.00001) ?? 0.00001;
const LIQUIDATE_MAX_RETRIES = 3;
const LIQUIDATE_BACKOFF_BASE_MS = envNumber('LIQUIDATE_BACKOFF_BASE_MS', 1000) ?? 1000;
const DRY_RUN_DEFAULT = envBoolean('DRY_RUN', true);

// ─── Upbit 잔고 조회 (실 운영용) ─────────────────────────────────────────────

function createUpbitToken(): string {
  const accessKey = requireEnv('UPBIT_ACCESS_KEY');
  const secretKey = requireEnv('UPBIT_SECRET_KEY');
  return jwt.sign({ access_key: accessKey, nonce: randomUUID() }, secretKey);
}

export async function fetchUpbitBalances(): Promise<UpbitBalanceRow[]> {
  const token = createUpbitToken();
  const res = await fetch('https://api.upbit.com/v1/accounts', {
    method: 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upbit 잔고 조회 실패(${res.status}): ${text.slice(0, 200)}`);
  }

  return (await res.json()) as UpbitBalanceRow[];
}

// ─── Upbit 시장가 매도 (실 운영용) ───────────────────────────────────────────

export async function placeUpbitMarketSell(symbol: string, qty: string): Promise<SellResult> {
  const accessKey = requireEnv('UPBIT_ACCESS_KEY');
  const secretKey = requireEnv('UPBIT_SECRET_KEY');

  const marketCode = symbol.startsWith('KRW-') ? symbol : `KRW-${symbol}`;
  const params: Record<string, string> = {
    market: marketCode,
    side: 'ask',
    ord_type: 'market',
    volume: new Big(qty).toString(),
  };

  const qs = new URLSearchParams(params).toString();
  const queryHash = createHash('sha512').update(qs, 'utf-8').digest('hex');
  const token = jwt.sign(
    {
      access_key: accessKey,
      nonce: randomUUID(),
      query_hash: queryHash,
      query_hash_alg: 'SHA512',
    },
    secretKey,
  );

  const res = await fetch('https://api.upbit.com/v1/orders', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  const text = await res.text();
  type UpbitOrderResponse = { uuid?: string; error?: { name?: string; message?: string } };
  let body: UpbitOrderResponse = {};
  try {
    body = JSON.parse(text) as UpbitOrderResponse;
  } catch {
    body = {};
  }

  if (!res.ok) {
    const msg = body.error?.message ?? text.slice(0, 200);
    return { success: false, message: `Upbit 주문 실패(${res.status}): ${msg}` };
  }

  const orderId = body.uuid;
  if (!orderId) {
    return { success: false, message: 'Upbit 응답에 uuid 없음' };
  }

  return { success: true, orderId, message: 'Upbit 청산 주문 접수 성공' };
}

// ─── DB 기록 ──────────────────────────────────────────────────────────────────

export async function saveLiquidationRecord(record: LiquidatePositionResult): Promise<void> {
  const supabase = getSupabase();

  const payload = {
    symbol: record.symbol,
    broker: 'UPBIT',
    market: 'CRYPTO',
    side: 'SELL',
    qty: record.requestedQty,
    price: '0', // 시장가 - 체결가 미확정
    order_id: record.orderId ?? null,
    status: record.success ? 'filled' : 'failed',
    error: record.error ?? null,
    executed_at: nowIso(),
    metadata: {
      source: 'circuit_breaker_liquidation',
      dryRun: record.dryRun,
      attempts: record.attempts,
    },
  };

  const { error } = await supabase.from('trades').insert(payload);

  if (error) {
    logger.error('청산 기록 저장 실패', { symbol: record.symbol, error: error.message });
    // 기록 실패는 청산 흐름을 막지 않음
  }
}

// ─── 알림 발송 ────────────────────────────────────────────────────────────────

export async function notifyLiquidation(
  message: string,
  details: Record<string, unknown>,
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('notification_events').insert({
    source_service: 'circuit-breaker',
    event_type: 'LIQUIDATION',
    level: details.failed ? 'ERROR' : 'WARNING',
    market: 'CRYPTO',
    title: '긴급 청산',
    message,
    payload: details,
    status: 'PENDING',
  });

  if (error) {
    logger.error('청산 알림 저장 실패', { error: error.message });
  }
}

// ─── 핵심 로직 ────────────────────────────────────────────────────────────────

/** KRW 이외 통화인지 확인 */
function isCoin(currency: string): boolean {
  return currency !== 'KRW';
}

/** 청산 수량 계산 (Big.js) */
function resolveQty(balance: string, liquidatePct: number): Big {
  const total = new Big(balance);
  const pct = new Big(Math.min(1, Math.max(0, liquidatePct)));
  return total.times(pct);
}

/** 최소 수량 이상인지 확인 */
function isAboveMinQty(qty: Big, minQty: number): boolean {
  try {
    return qty.gte(new Big(minQty));
  } catch {
    return false;
  }
}

/**
 * Upbit 전체 포지션 청산
 *
 * 의존성 주입(deps)을 통해 테스트 가능하며,
 * 실 운영에서는 createLiveDeps()로 생성한 deps를 주입합니다.
 */
export async function liquidateAllUpbitPositions(
  deps: LiquidatorDeps,
  options?: LiquidateOptions,
): Promise<LiquidateAllResult> {
  const dryRun = options?.dryRun ?? DRY_RUN_DEFAULT;
  const liquidatePct = options?.liquidatePct ?? LIQUIDATE_PCT;
  const minQty = options?.minQty !== undefined ? parseFloat(options.minQty) : LIQUIDATE_MIN_QTY;
  const sleepFn = deps.sleep ?? defaultSleep;

  logger.info('Upbit 전체 청산 시작', {
    dryRun,
    liquidatePct,
    minQty,
  });

  // 1. 잔고 조회
  const balances = await deps.fetchBalances();
  const coins = balances.filter((b) => isCoin(b.currency));

  const results: LiquidatePositionResult[] = [];
  let successCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  // 2. 심볼별 청산 처리
  for (const coin of coins) {
    const symbol = `KRW-${coin.currency}`;
    const qty = resolveQty(coin.balance, liquidatePct);

    // 최소 수량 미만 스킵
    if (!isAboveMinQty(qty, minQty)) {
      logger.info('최소 수량 미만 스킵', { symbol, qty: qty.toString(), minQty });
      skippedCount++;
      continue;
    }

    const qtyStr = qty.toFixed(8);

    if (dryRun) {
      // DRY_RUN: 주문 미발행, 기록만
      const record: LiquidatePositionResult = {
        symbol,
        requestedQty: qtyStr,
        success: true,
        attempts: 0,
        dryRun: true,
      };
      results.push(record);
      await deps.saveRecord(record);
      successCount++;
      continue;
    }

    // 3. 시장가 매도 (지수 백오프 재시도)
    const backoff = createBackoff({
      baseMs: LIQUIDATE_BACKOFF_BASE_MS,
      maxMs: LIQUIDATE_BACKOFF_BASE_MS * 8,
    });

    let lastError: string | undefined;
    let orderId: string | undefined;
    let succeeded = false;
    let attempt = 0;

    for (let i = 0; i < LIQUIDATE_MAX_RETRIES; i++) {
      attempt = i + 1;

      try {
        const result = await deps.placeMarketSell(symbol, qtyStr);

        if (result.success) {
          orderId = result.orderId;
          succeeded = true;
          break;
        }

        lastError = result.message;
        logger.warn('청산 주문 실패 - 재시도 예정', {
          symbol,
          attempt,
          error: lastError,
          maxRetries: LIQUIDATE_MAX_RETRIES,
        });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        logger.warn('청산 주문 예외 - 재시도 예정', {
          symbol,
          attempt,
          error: lastError,
        });
      }

      if (i < LIQUIDATE_MAX_RETRIES - 1) {
        await sleepFn(backoff.nextDelayMs());
      }
    }

    const record: LiquidatePositionResult = {
      symbol,
      requestedQty: qtyStr,
      success: succeeded,
      orderId,
      error: succeeded ? undefined : lastError,
      attempts: attempt,
      dryRun: false,
    };

    results.push(record);
    await deps.saveRecord(record);

    if (succeeded) {
      successCount++;
      logger.info('청산 성공', { symbol, orderId, qty: qtyStr });
    } else {
      failedCount++;
      logger.error('청산 최종 실패', { symbol, attempts: attempt, error: lastError });
    }
  }

  const summary: LiquidateAllResult = {
    total: coins.length - skippedCount,
    success: successCount,
    failed: failedCount,
    skipped: skippedCount,
    results,
    dryRun,
  };

  // 4. 청산 결과 알림
  const failedSymbols = results.filter((r) => !r.success).map((r) => r.symbol);

  if (failedSymbols.length > 0) {
    await deps.notify(`청산 실패: ${failedSymbols.join(', ')}`, {
      failed: failedCount,
      success: successCount,
      failedSymbols,
      dryRun,
    });
  } else {
    await deps.notify(
      `청산 완료 (성공: ${successCount}, 스킵: ${skippedCount}${dryRun ? ' / DRY_RUN' : ''})`,
      { success: successCount, skipped: skippedCount, dryRun },
    );
  }

  logger.info('Upbit 전체 청산 완료', summary);
  return summary;
}

/**
 * 실 운영용 deps 생성
 *
 * index.ts 또는 circuit-breaker.ts에서 호출합니다.
 */
export function createLiveDeps(): LiquidatorDeps {
  return {
    fetchBalances: fetchUpbitBalances,
    placeMarketSell: placeUpbitMarketSell,
    saveRecord: saveLiquidationRecord,
    notify: notifyLiquidation,
    sleep: defaultSleep,
  };
}
