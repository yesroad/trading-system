import { getSupabase } from '@workspace/db-client';

export type NotificationLevel = 'INFO' | 'WARNING' | 'ERROR';

export async function enqueueNotificationEvent(params: {
  sourceService: string;
  eventType: string;
  level: NotificationLevel;
  market: 'KR' | 'US' | 'CRYPTO' | 'GLOBAL';
  title: string;
  message: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
}): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.from('notification_events').insert({
    source_service: params.sourceService,
    event_type: params.eventType,
    level: params.level,
    market: params.market,
    title: params.title,
    message: params.message,
    payload: params.payload ?? null,
    dedupe_key: params.dedupeKey ?? null,
    status: 'PENDING',
  });

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '23505') return;
    throw new Error(`notification_events insert 실패: ${error.message}`);
  }
}
