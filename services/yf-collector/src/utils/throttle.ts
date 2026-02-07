import { DateTime } from 'luxon';

type ThrottleConfig = {
  rps: number; // max requests per second
  label?: string;
};

/**
 * ✅ 전역 쓰로틀 (직렬 큐 + 토큰버킷)
 * - 어떤 심볼이든 Yahoo API 호출은 반드시 이 큐를 통해서만 나가게 한다.
 * - 경쟁 상태(race) 제거: "항상 한 번에 1개 요청"만 실행
 */
export function createGlobalThrottle(cfg: ThrottleConfig) {
  const rps = Math.max(1, Math.floor(cfg.rps));
  const minGapMs = Math.ceil(1000 / rps);

  let chain = Promise.resolve();
  let lastAt = 0;

  async function waitGap() {
    const now = DateTime.now().toMillis();
    const elapsed = now - lastAt;
    if (elapsed < minGapMs) {
      await new Promise((r) => setTimeout(r, minGapMs - elapsed));
    }
  }

  return {
    minGapMs,
    async run<T>(fn: () => Promise<T>): Promise<T> {
      // ✅ 무조건 직렬 실행 (반환값은 호출자에게, 체인은 void로 유지)
      const p = chain.then(async () => {
        await waitGap();
        const v = await fn();
        lastAt = DateTime.now().toMillis();
        return v;
      });

      // chain은 항상 Promise<void>로 유지 (에러가 나도 체인은 계속 진행)
      chain = p.then(
        () => undefined,
        () => undefined,
      );
      return p;
    },
  };
}
