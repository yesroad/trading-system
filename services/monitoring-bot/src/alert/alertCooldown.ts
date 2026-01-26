const sentAt = new Map<string, number>();

export function canSendAlert(key: string, cooldownMin: number) {
  const now = Date.now();
  const last = sentAt.get(key) ?? 0;
  if (now - last < cooldownMin * 60000) return false;
  sentAt.set(key, now);
  return true;
}
