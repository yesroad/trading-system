import type { MarketMode } from '../config/schedule';

type ShouldCallAIParams = {
  mode: MarketMode;
  lastAiCallAt: Date | null;
  minIntervalMs: number; // 최소 호출 간격(전역)
  modeCooldownMs?: Partial<Record<MarketMode, number>>; // 모드별 추가 쿨다운(옵션)
};

/**
 * ✅ shouldCallAI
 * - LLM 호출 비용 폭주 방지용 게이트
 * - 전역 최소 호출 간격(minIntervalMs) + 모드별 추가 쿨다운을 함께 고려
 *
 * 설계 의도:
 * - PRE_OPEN/CLOSE 등 “의미 있는 타이밍”에서 호출은 허용하되
 * - 루프가 자주 돌더라도 LLM은 "정해진 간격" 이상으로는 호출되지 않게 막는다.
 */
export function shouldCallAI(params: ShouldCallAIParams): boolean {
  const { mode, lastAiCallAt, minIntervalMs, modeCooldownMs } = params;

  if (!Number.isFinite(minIntervalMs) || minIntervalMs <= 0) {
    throw new Error(`AI_MIN_CALL_INTERVAL_MS 값이 잘못되었습니다: ${minIntervalMs}`);
  }

  // 최초 호출은 허용
  if (!lastAiCallAt) return true;

  const now = Date.now();
  const last = lastAiCallAt.getTime();

  if (!Number.isFinite(last)) return true;

  const baseOk = now - last >= minIntervalMs;
  if (!baseOk) return false;

  // 모드별로 더 엄격하게 막고 싶으면 여기서 추가 적용
  const extra = modeCooldownMs?.[mode];
  if (extra == null) return true;

  if (!Number.isFinite(extra) || extra < 0) {
    throw new Error(`modeCooldownMs[${mode}] 값이 잘못되었습니다: ${String(extra)}`);
  }

  return now - last >= Math.max(minIntervalMs, extra);
}
