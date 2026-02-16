'use client';

import * as React from 'react';
import { useRiskEventsQuery } from '@/queries/risk-events';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { severityTone } from './format';

export const RiskAlertsWidget = React.memo(function RiskAlertsWidget() {
  const { data, isLoading, isError } = useRiskEventsQuery({
    hours: 24,
    refetchInterval: 15_000,
  });

  // 로딩 중이거나 에러이거나 데이터가 없으면 렌더링하지 않음
  if (isLoading || isError || !data) return null;

  // Critical + High 이벤트만 필터링
  const criticalAndHighEvents = data.events.filter(
    (event) => event.severity === 'critical' || event.severity === 'high'
  );

  // 이벤트가 없으면 렌더링하지 않음
  if (criticalAndHighEvents.length === 0) return null;

  const displayEvents = criticalAndHighEvents.slice(0, 5);

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span>리스크 알림</span>
          <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700">
            {data.meta.criticalCount}건
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {displayEvents.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-2 rounded-lg bg-white p-2 text-xs"
          >
            <Badge className={severityTone(event.severity)} variant="secondary">
              {event.severity.toUpperCase()}
            </Badge>
            <span className="font-semibold text-slate-900">{event.event_type}</span>
            {event.symbol && (
              <span className="ml-auto text-slate-600">{event.symbol}</span>
            )}
          </div>
        ))}

        {criticalAndHighEvents.length > 5 && (
          <p className="pt-1 text-center text-xs text-slate-500">
            +{criticalAndHighEvents.length - 5}개 더 있음
          </p>
        )}
      </CardContent>
    </Card>
  );
});
