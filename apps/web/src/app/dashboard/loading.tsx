import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <Skeleton className="h-72 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  );
}
