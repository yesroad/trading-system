export type AlertLevel = 'OK' | 'WARN' | 'CRIT';

export const LEVEL_EMOJI: Record<AlertLevel, string> = {
  OK: '🟢',
  WARN: '🟡',
  CRIT: '🔴',
};
