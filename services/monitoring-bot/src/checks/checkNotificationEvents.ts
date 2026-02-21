import { env } from '../config/env.js';
import { sendTelegram } from '../alert/sendTelegram.js';
import { marketLabel, toKstDisplay } from '../utils/time.js';
import {
  fetchSymbolCatalogRows,
  fetchPendingNotificationEvents,
  markNotificationEventFailed,
  markNotificationEventSent,
  type NotificationEventRow,
  type SymbolCatalogRow,
} from '../db/queries.js';

function normalizeLevel(level: string): 'INFO' | 'WARNING' | 'ERROR' {
  if (level === 'ERROR') return 'ERROR';
  if (level === 'WARNING') return 'WARNING';
  return 'INFO';
}

const ALLOWED_INFO_EVENT_TYPES = new Set([
  'TRADE_FILLED',
  'BUY_FILLED',
  'SELL_FILLED',
  'TRADE_FAILED',
  'TRADE_EXECUTION_ERROR',
  'CIRCUIT_BREAKER',
  'LIQUIDATION',
]);

function shouldForwardNotification(row: NotificationEventRow): boolean {
  const level = normalizeLevel(row.level);
  if (level === 'ERROR') return true;

  const eventType = String(row.event_type ?? '')
    .trim()
    .toUpperCase();

  return ALLOWED_INFO_EVENT_TYPES.has(eventType);
}

function toEventType(row: NotificationEventRow): string {
  return String(row.event_type ?? '')
    .trim()
    .toUpperCase();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) return null;
  return value as Record<string, unknown>;
}

function normalizeLookupMarket(raw: string | null | undefined): 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL' {
  const market = String(raw ?? '')
    .trim()
    .toUpperCase();

  if (market === 'KR' || market === 'KRX' || market === 'KIS') return 'KRX';
  if (market === 'US' || market === 'YF') return 'US';
  if (market === 'CRYPTO' || market === 'UPBIT') return 'CRYPTO';
  return 'GLOBAL';
}

function toCatalogKey(market: string, symbol: string): string {
  return `${market}:${symbol}`.toUpperCase();
}

function buildCatalogMap(rows: SymbolCatalogRow[]): Map<string, SymbolCatalogRow> {
  const map = new Map<string, SymbolCatalogRow>();

  for (const row of rows) {
    const market = normalizeLookupMarket(row.market);
    if (market === 'GLOBAL') continue;
    const symbol = String(row.symbol ?? '').trim();
    if (!symbol) continue;

    map.set(toCatalogKey(market, symbol), row);

    if (market === 'KRX') {
      if (symbol.startsWith('KRX:')) map.set(toCatalogKey(market, symbol.slice(4)), row);
      else map.set(toCatalogKey(market, `KRX:${symbol}`), row);
    }
    if (market === 'US') {
      if (symbol.startsWith('US:')) map.set(toCatalogKey(market, symbol.slice(3)), row);
      else map.set(toCatalogKey(market, `US:${symbol}`), row);
    }
    if (market === 'CRYPTO') {
      const hyphenIndex = symbol.indexOf('-');
      if (hyphenIndex >= 0 && hyphenIndex < symbol.length - 1) {
        map.set(toCatalogKey(market, symbol.slice(hyphenIndex + 1)), row);
      }
    }
  }

  return map;
}

function resolveEventPayload(row: NotificationEventRow): Record<string, unknown> {
  return asRecord(row.payload) ?? {};
}

function pickSymbolFromPayload(payload: Record<string, unknown>): string | null {
  const candidates = [
    payload.symbol,
    payload.ticker,
    payload.code,
    payload.marketSymbol,
    payload.instrument,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const value = candidate.trim();
    if (value) return value;
  }

  return null;
}

function pickMarketFromPayload(
  row: NotificationEventRow,
  payload: Record<string, unknown>,
): 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL' {
  const payloadMarket =
    typeof payload.market === 'string'
      ? payload.market
      : typeof payload.exchange === 'string'
        ? payload.exchange
        : null;

  return normalizeLookupMarket(payloadMarket ?? row.market);
}

function lookupCatalogRow(
  catalogMap: Map<string, SymbolCatalogRow>,
  market: 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL',
  symbol: string | null,
): SymbolCatalogRow | null {
  if (!symbol || market === 'GLOBAL') return null;

  const raw = symbol.trim();
  if (!raw) return null;

  const direct = catalogMap.get(toCatalogKey(market, raw));
  if (direct) return direct;

  if (market === 'CRYPTO' && raw.includes('-')) {
    const coin = raw.split('-')[1];
    if (coin) {
      const byCoin = catalogMap.get(toCatalogKey(market, coin));
      if (byCoin) return byCoin;
    }
  }

  return null;
}

function resolveSymbolDisplay(
  catalogMap: Map<string, SymbolCatalogRow>,
  market: 'KRX' | 'US' | 'CRYPTO' | 'GLOBAL',
  symbol: string | null,
): string {
  if (!symbol) return '-';

  const row = lookupCatalogRow(catalogMap, market, symbol);
  if (!row) return symbol;

  const name =
    market === 'US'
      ? (row.name_en ?? row.name_ko ?? '').trim()
      : (row.name_ko ?? row.name_en ?? '').trim();

  if (!name || name === symbol) return symbol;
  return `${name} (${symbol})`;
}

function formatCount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('ko-KR', {
      maximumFractionDigits: value % 1 === 0 ? 0 : 8,
    });
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed.toLocaleString('ko-KR', {
        maximumFractionDigits: parsed % 1 === 0 ? 0 : 8,
      });
    }

    const fallback = value.trim();
    return fallback.length > 0 ? fallback : null;
  }

  return null;
}

function formatPrice(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('ko-KR');
  }

  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed.toLocaleString('ko-KR');
    const fallback = value.trim();
    return fallback.length > 0 ? fallback : null;
  }

  return null;
}

function normalizeTradeSide(
  eventType: string,
  payload: Record<string, unknown>,
): 'BUY' | 'SELL' | null {
  if (eventType === 'BUY_FILLED') return 'BUY';
  if (eventType === 'SELL_FILLED') return 'SELL';

  const side = String(payload.side ?? payload.decision ?? '')
    .trim()
    .toUpperCase();

  if (side === 'BUY' || side === 'SELL') return side;
  return null;
}

function pickOccurredAt(row: NotificationEventRow, payload: Record<string, unknown>): string {
  const candidates = [
    payload.executed_at,
    payload.executedAt,
    payload.occurred_at,
    payload.occurredAt,
    payload.timestamp,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const iso = value.trim();
    if (iso) return iso;
  }

  return row.created_at;
}

function levelEmoji(level: 'INFO' | 'WARNING' | 'ERROR'): string {
  if (level === 'ERROR') return '🔥';
  if (level === 'WARNING') return '⚠️';
  return '✅';
}

function formatExternalNotification(
  row: NotificationEventRow,
  catalogMap: Map<string, SymbolCatalogRow>,
): string {
  const level = normalizeLevel(row.level);
  const eventType = toEventType(row);
  const payload = resolveEventPayload(row);
  const market = pickMarketFromPayload(row, payload);
  const symbol = pickSymbolFromPayload(payload);
  const symbolLabel = resolveSymbolDisplay(catalogMap, market, symbol);
  const occurredAt = pickOccurredAt(row, payload);
  const occurredAtLabel = (() => {
    try {
      return toKstDisplay(occurredAt);
    } catch {
      return toKstDisplay(row.created_at);
    }
  })();

  if (eventType === 'BUY_FILLED' || eventType === 'SELL_FILLED' || eventType === 'TRADE_FILLED') {
    const side = normalizeTradeSide(eventType, payload);
    const qty = formatCount(payload.qty ?? payload.quantity ?? payload.executedQty);
    const price = formatPrice(payload.price ?? payload.executedPrice);
    const sideTitle = side === 'BUY' ? '🟦 BUY 체결' : side === 'SELL' ? '🟥 SELL 체결' : '✅ 체결';
    const lines = [`${env.ALERT_PREFIX} ${sideTitle}`, `- 시장: ${marketLabel(market)}`];
    if (symbol) lines.push(`- 종목: ${symbolLabel}`);
    if (qty) lines.push(`- 수량: ${qty}`);
    if (price) lines.push(`- 가격: ${price}`);
    lines.push(`- 시간: ${occurredAtLabel} (KST)`);
    return lines.join('\n');
  }

  if (eventType === 'TRADE_FAILED' || eventType === 'TRADE_EXECUTION_ERROR') {
    const lines = [`${env.ALERT_PREFIX} ❌ 주문 실패`, `- 시장: ${marketLabel(market)}`];
    if (symbol) lines.push(`- 종목: ${symbolLabel}`);
    lines.push(`- 사유: ${row.message}`);
    lines.push(`- 시간: ${occurredAtLabel} (KST)`);
    return lines.join('\n');
  }

  if (eventType === 'CIRCUIT_BREAKER') {
    return [
      `${env.ALERT_PREFIX} ⚠️ 서킷 브레이커`,
      `- 시장: ${marketLabel(market)}`,
      `- 내용: ${row.message}`,
      `- 시간: ${occurredAtLabel} (KST)`,
    ].join('\n');
  }

  if (eventType === 'LIQUIDATION') {
    const lines = [
      `${env.ALERT_PREFIX} ⚠️ 긴급 청산`,
      `- 시장: ${marketLabel(market)}`,
      `- 내용: ${row.message}`,
      `- 시간: ${occurredAtLabel} (KST)`,
    ];
    if (symbol) lines.splice(2, 0, `- 종목: ${symbolLabel}`);
    return lines.join('\n');
  }

  return [
    `${env.ALERT_PREFIX} ${levelEmoji(level)} ${level}`,
    `- 시장: ${marketLabel(market)}`,
    `- 유형: ${row.title}`,
    `- 대상: ${row.source_service}`,
    `- 내용: ${row.message}`,
    `- 시간: ${occurredAtLabel} (KST)`,
  ].join('\n');
}

async function buildSymbolCatalog(
  rows: NotificationEventRow[],
): Promise<Map<string, SymbolCatalogRow>> {
  const pairs: Array<{ market: string; symbol: string }> = [];

  for (const row of rows) {
    const payload = resolveEventPayload(row);
    const symbol = pickSymbolFromPayload(payload);
    if (!symbol) continue;

    const market = pickMarketFromPayload(row, payload);
    if (market === 'GLOBAL') continue;

    pairs.push({
      market,
      symbol,
    });
  }

  if (pairs.length === 0) return new Map<string, SymbolCatalogRow>();

  try {
    const catalogRows = await fetchSymbolCatalogRows(pairs);
    return buildCatalogMap(catalogRows);
  } catch (error: unknown) {
    console.error(
      `[TRADING] symbol_catalog 조회 실패(알림 포맷 fallback): ${error instanceof Error ? error.message : String(error)}`,
    );
    return new Map<string, SymbolCatalogRow>();
  }
}

/**
 * trade-executor 등 외부 서비스가 적재한 notification_events를 전송한다.
 */
export async function checkNotificationEvents(): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  if (!env.NOTIFICATION_EVENTS_ENABLED) {
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const rows = await fetchPendingNotificationEvents(env.NOTIFICATION_EVENTS_LIMIT);
  if (rows.length === 0) {
    return { sent: 0, failed: 0, skipped: 0 };
  }
  const catalogMap = await buildSymbolCatalog(rows);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      if (!shouldForwardNotification(row)) {
        await markNotificationEventSent(row.id);
        skipped += 1;
        continue;
      }

      const text = formatExternalNotification(row, catalogMap);
      const level = normalizeLevel(row.level);

      await sendTelegram(text, { isCriticalRepeat: level === 'ERROR' });
      await markNotificationEventSent(row.id);
      sent += 1;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);

      try {
        await markNotificationEventFailed(row.id, msg);
        failed += 1;
      } catch (markError: unknown) {
        console.error(
          `[TRADING] notification_events FAILED 업데이트 실패(id=${row.id}): ${markError instanceof Error ? markError.message : String(markError)}`,
        );
        skipped += 1;
      }
    }
  }

  return { sent, failed, skipped };
}
