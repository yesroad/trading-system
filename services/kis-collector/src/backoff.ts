/**
 * 실패할수록 기다리는 시간 증가 (지수 백오프 + jitter)
 */

export function createBackoff(opts?: { baseMs?: number; maxMs?: number }) {
  const baseMs = opts?.baseMs ?? 500;
  const maxMs = opts?.maxMs ?? 30_000;

  let attempt = 0;

  function reset() {
    attempt = 0;
  }

  function nextDelayMs() {
    // base * 2^attempt (최대 maxMs)
    const exp = Math.min(maxMs, baseMs * Math.pow(2, attempt));
    attempt = Math.min(attempt + 1, 20);

    // jitter: 70%~130%
    const jitter = exp * (0.7 + Math.random() * 0.6);
    return Math.floor(jitter);
  }

  return { reset, nextDelayMs };
}
