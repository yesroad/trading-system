import { supabase } from '../db/supabase';
import { env } from '../config/env';
import type { AlertLevel } from '../types/status';

export async function checkWorkers() {
  const { data, error } = await supabase.from('worker_status').select('*');
  if (error) throw error;

  const now = Date.now();
  const results: {
    level: AlertLevel;
    service: string;
    runMode: string;
    message: string;
  }[] = [];

  for (const w of data ?? []) {
    if (!w.last_success_at) {
      results.push({
        level: 'CRIT',
        service: w.service,
        runMode: w.run_mode,
        message: '정상 수집 기록 없음',
      });
      continue;
    }

    const lagMin = (now - new Date(w.last_success_at).getTime()) / 60000;

    if (lagMin >= env.WORKER_LAG_CRIT_MIN) {
      results.push({
        level: 'CRIT',
        service: w.service,
        runMode: w.run_mode,
        message: `마지막 성공 ${Math.floor(lagMin)}분 전`,
      });
    } else if (lagMin >= env.WORKER_LAG_WARN_MIN) {
      results.push({
        level: 'WARN',
        service: w.service,
        runMode: w.run_mode,
        message: `마지막 성공 ${Math.floor(lagMin)}분 전`,
      });
    }
  }

  return results;
}
