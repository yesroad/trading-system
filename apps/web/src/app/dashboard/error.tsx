'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50">
      <CardContent className="p-6 text-sm text-rose-700">
        <p className="font-semibold">대시보드 오류가 발생했습니다.</p>
        <p className="pt-1">{error.message}</p>
        <Button type="button" variant="default" size="sm" onClick={reset} className="mt-3">
          다시 시도
        </Button>
      </CardContent>
    </Card>
  );
}
