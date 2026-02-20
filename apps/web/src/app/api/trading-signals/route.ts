import { NextResponse } from 'next/server';
import { getUnconsumedSignals } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import type { TradingSignalsResponse } from '@/types/api/trading-signals';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const marketParam = url.searchParams.get('market');
    const minConfidenceParam = url.searchParams.get('minConfidence');

    // 파라미터 파싱
    const market = marketParam as 'CRYPTO' | 'KRX' | 'US' | null;
    const minConfidence = minConfidenceParam ? parseFloat(minConfidenceParam) : 0;

    // Validate market
    if (market && !['CRYPTO', 'KRX', 'US'].includes(market)) {
      return NextResponse.json(
        { error: { message: 'Invalid market parameter' } },
        { status: 400 }
      );
    }

    // Validate minConfidence
    if (isNaN(minConfidence) || minConfidence < 0 || minConfidence > 1) {
      return NextResponse.json(
        { error: { message: 'Invalid minConfidence parameter (must be 0-1)' } },
        { status: 400 }
      );
    }

    // DB 조회
    const signals = await getUnconsumedSignals({
      market: market ?? undefined,
      minConfidence: minConfidence > 0 ? minConfidence : undefined,
    });

    // 최대 50개로 제한
    const limited = signals.slice(0, 50);

    // 평균 신뢰도 계산
    const avgConfidence =
      limited.length > 0
        ? limited.reduce((sum, s) => sum + s.confidence, 0) / limited.length
        : 0;

    const response: TradingSignalsResponse = {
      signals: limited,
      meta: {
        total: limited.length,
        averageConfidence: parseFloat(avgConfidence.toFixed(3)),
        generatedAtUtc: nowIso(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[trading-signals API] Error:', error);
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
