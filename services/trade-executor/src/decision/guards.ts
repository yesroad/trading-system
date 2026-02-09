import { checkDailyTradeLimit, checkSystemGuard, tryAutoRecoverSystemGuard } from '../db/guards.js';

export type AllGuardsResult = {
  allowed: boolean;
  reasons: string[];
  systemGuard: Awaited<ReturnType<typeof checkSystemGuard>>;
  dailyLimit: Awaited<ReturnType<typeof checkDailyTradeLimit>>;
  recovered: boolean;
};

/**
 * 거래 전 가드를 통합 체크한다.
 */
export async function checkAllGuards(): Promise<AllGuardsResult> {
  let systemGuard = await checkSystemGuard();
  let recovered = false;

  if (!systemGuard.allowed && !systemGuard.tradingEnabled) {
    const recovery = await tryAutoRecoverSystemGuard();
    if (recovery.recovered) {
      recovered = true;
      systemGuard = await checkSystemGuard();
    }
  }

  const dailyLimit = await checkDailyTradeLimit();

  const reasons: string[] = [];
  if (!systemGuard.allowed) reasons.push(systemGuard.reason);
  if (!dailyLimit.allowed) reasons.push(dailyLimit.reason);

  return {
    allowed: reasons.length === 0,
    reasons,
    systemGuard,
    dailyLimit,
    recovered,
  };
}
