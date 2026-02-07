/**
 * 지수 백오프 + jitter
 */
export function createBackoff(opts?: { baseMs?: number; maxMs?: number }) {
  const baseMs = opts?.baseMs ?? 1000;
  const maxMs = opts?.maxMs ?? 30000;

  let attempt = 0;

  function reset() {
    attempt = 0;
  }

  function next(): number {
    const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
    attempt++;
    return delay;
  }

  function nextDelayMs(): number {
    // base * 2^attempt (최대 maxMs)
    const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    attempt = Math.min(attempt + 1, 20);

    // jitter: 70%~130%
    const jitter = exp * (0.7 + Math.random() * 0.6);
    return Math.floor(jitter);
  }

  return { reset, next, nextDelayMs };
}
