import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { getRecentRiskEvents, countCriticalEventsRecent } from '@workspace/db-client';
import { nowIso } from '@workspace/shared-utils';
import { requireApiUser } from '@/lib/auth/require-api-user';
import type { RiskEventsResponse } from '@/types/api/risk-events';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const auth = await requireApiUser();
    if (auth instanceof NextResponse) return auth;

    const url = new URL(req.url);
    const severityParam = url.searchParams.get('severity');
    const hoursParam = url.searchParams.get('hours');

    // 파라미터 파싱
    const severity = severityParam as 'low' | 'medium' | 'high' | 'critical' | null;
    const hours = hoursParam ? parseInt(hoursParam, 10) : 24;

    // Validate severity
    if (severity && !['low', 'medium', 'high', 'critical'].includes(severity)) {
      return NextResponse.json(
        { error: { message: 'Invalid severity parameter' } },
        { status: 400 },
      );
    }

    // Validate hours
    if (isNaN(hours) || hours < 1 || hours > 168) {
      return NextResponse.json(
        { error: { message: 'Invalid hours parameter (must be 1-168)' } },
        { status: 400 },
      );
    }

    // DB 조회 (병렬 실행)
    const [events, criticalCount] = await Promise.all([
      getRecentRiskEvents({
        severity: severity ?? undefined,
        limit: 100,
      }),
      countCriticalEventsRecent(hours),
    ]);

    // 시간 범위 필터링
    const cutoffMs = DateTime.utc().minus({ hours }).toMillis();
    const filtered = events.filter((e) => {
      const createdAt = DateTime.fromISO(e.created_at, { setZone: true });
      if (!createdAt.isValid) return false;
      const createdMs = createdAt.toUTC().toMillis();
      return createdMs >= cutoffMs;
    });

    // High 이벤트 개수 집계
    const highCount = filtered.filter((e) => e.severity === 'high').length;

    const response: RiskEventsResponse = {
      events: filtered,
      meta: {
        total: filtered.length,
        criticalCount,
        highCount,
        generatedAtUtc: nowIso(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[risk-events API] Error:', error);
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
