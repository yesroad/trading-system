import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env.server';
import { requireApiUser } from '@/lib/auth/require-api-user';
import { nowIso, type Nullable } from '@workspace/shared-utils';
import type { TradeHistoryResponse, TradeExecutionDTO } from '@/types/api/trade-history';

export const runtime = 'nodejs';

let supabase: ReturnType<typeof createClient> | null = null;

type JsonRecord = Record<string, unknown>;

type TradeExecutionRow = {
  id: Nullable<string>;
  broker: Nullable<string>;
  symbol: Nullable<string>;
  side: Nullable<string>;
  status: Nullable<string>;
  quantity: Nullable<number | string>;
  price: Nullable<number | string>;
  executed_qty: Nullable<number | string>;
  executed_price: Nullable<number | string>;
  metadata: unknown;
  created_at: Nullable<string>;
};

function getSupabase() {
  if (!supabase) {
    supabase = createClient(envServer('SUPABASE_URL'), envServer('SUPABASE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

function toSafeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

function toMetadata(value: unknown): JsonRecord {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return {};
}

function toTradeSide(value: unknown): 'BUY' | 'SELL' {
  return value === 'SELL' ? 'SELL' : 'BUY';
}

function toMarket(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export async function GET(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const market = url.searchParams.get('market');
    const broker = url.searchParams.get('broker');

    const client = getSupabase();

    // 기본 쿼리
    let query = client
      .from('trade_executions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    // Broker 필터
    if (broker) {
      query = query.eq('broker', broker);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`trade_executions 조회 실패: ${error.message}`);
    }

    // Metadata에서 market 추출
    const rows = (data ?? []) as TradeExecutionRow[];
    const trades: TradeExecutionDTO[] = rows.map((row) => {
      const metadata = toMetadata(row.metadata);
      return {
        id: row.id ?? '',
        broker: row.broker ?? '',
        symbol: row.symbol ?? '',
        side: toTradeSide(row.side),
        status: row.status ?? '',
        quantity: toSafeNumber(row.quantity),
        price: toSafeNumber(row.price),
        executed_qty: toSafeNumber(row.executed_qty),
        executed_price: toSafeNumber(row.executed_price),
        market: toMarket(metadata.market),
        metadata,
        created_at: row.created_at ?? '',
      };
    });

    // Market 필터 (프론트엔드)
    const filtered = market
      ? trades.filter((t) => t.market?.toUpperCase() === market.toUpperCase())
      : trades;

    const response: TradeHistoryResponse = {
      trades: filtered,
      meta: {
        total: filtered.length,
        generatedAtUtc: nowIso(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[trade-history API] Error:', error);
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 },
    );
  }
}
