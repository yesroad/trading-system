import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { envServer } from '@/lib/env.server';
import { nowIso } from '@workspace/shared-utils';
import type { TradeHistoryResponse, TradeExecutionDTO } from '@/types/api/trade-history';

export const runtime = 'nodejs';

let supabase: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(envServer('SUPABASE_URL'), envServer('SUPABASE_KEY'), {
      auth: { persistSession: false },
    });
  }
  return supabase;
}

export async function GET(req: Request) {
  try {
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
    const trades: TradeExecutionDTO[] = (data ?? []).map((row: any) => {
      const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
      return {
        id: row.id ?? '',
        broker: row.broker ?? '',
        symbol: row.symbol ?? '',
        side: row.side ?? 'BUY',
        status: row.status ?? '',
        quantity: parseFloat(row.quantity ?? 0),
        price: parseFloat(row.price ?? 0),
        executed_qty: parseFloat(row.executed_qty ?? 0),
        executed_price: parseFloat(row.executed_price ?? 0),
        market: metadata.market ?? null,
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
      { status: 500 }
    );
  }
}
