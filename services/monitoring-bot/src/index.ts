import { env } from './config/env.js';
import { DateTime } from 'luxon';
import { formatMessage } from './alert/formatMessage.js';
import { sendTelegram } from './alert/sendTelegram.js';
import { shouldSendAlert, recordAlertSent } from './alert/alertCooldown.js';

import { checkWorkers } from './checks/checkWorkers.js';
import { checkIngestionRuns } from './checks/checkIngestionRuns.js';
import { checkAiResults } from './checks/checkAiResults.js';
import { checkNotificationEvents } from './checks/checkNotificationEvents.js';
import { checkTradingSignals } from './checks/checkTradingSignals.js';
import { checkRiskEvents } from './checks/checkRiskEvents.js';
import { checkTrades } from './checks/checkTrades.js';
import { buildDailyReportText } from './checks/dailyReport.js';

function isSessionActiveForEnabledMarkets(): boolean {
  if (env.MONITORING_RUN_MODE === 'NO_CHECK') return true;

  const nowKst = DateTime.now().setZone('Asia/Seoul');
  const nowNy = DateTime.now().setZone('America/New_York');

  const isKrActive = (() => {
    if (!env.ENABLE_KR) return false;
    if (nowKst.weekday >= 6) return false;
    const m = nowKst.hour * 60 + nowKst.minute;
    if (env.MONITORING_RUN_MODE === 'PREMARKET') return m >= 8 * 60 && m <= 9 * 60;
    if (env.MONITORING_RUN_MODE === 'AFTERMARKET') return m >= 15 * 60 + 30 && m <= 16 * 60;
    if (env.MONITORING_RUN_MODE === 'EXTENDED') return m >= 8 * 60 && m <= 16 * 60;
    return m >= 9 * 60 && m <= 15 * 60 + 30;
  })();

  const isUsActive = (() => {
    if (!env.ENABLE_US) return false;
    if (nowNy.weekday >= 6) return false;
    const m = nowNy.hour * 60 + nowNy.minute;
    if (env.MONITORING_RUN_MODE === 'PREMARKET') return m >= 4 * 60 && m <= 9 * 60 + 30;
    if (env.MONITORING_RUN_MODE === 'AFTERMARKET') return m >= 16 * 60 && m <= 20 * 60;
    if (env.MONITORING_RUN_MODE === 'EXTENDED') return m >= 4 * 60 && m <= 20 * 60;
    return m >= 9 * 60 + 30 && m <= 16 * 60;
  })();

  const isCryptoActive = env.ENABLE_CRYPTO;

  return isKrActive || isUsActive || isCryptoActive;
}

async function runChecksOnce() {
  if (!isSessionActiveForEnabledMarkets()) {
    console.log(`[TRADING] 세션 외 스킵 (MONITORING_RUN_MODE=${env.MONITORING_RUN_MODE})`);
    return;
  }

  const all = [
    ...(await checkWorkers()),
    ...(await checkIngestionRuns()),
    ...(await checkAiResults()),
    ...(await checkTradingSignals()),
    ...(await checkRiskEvents()),
    ...(await checkTrades()),
  ];

  // WARN/CRIT만 알림
  const events = all.filter((e) => e.level !== 'OK');

  for (const e of events) {
    const decision = shouldSendAlert(e);
    if (!decision.send) continue;

    const text = formatMessage(e);
    await sendTelegram(text, { isCriticalRepeat: decision.isCriticalRepeat });
    recordAlertSent(e);
  }

  if (events.length === 0) {
    console.log('[TRADING] 이상 징후 없음');
  }

  const external = await checkNotificationEvents();
  if (external.sent > 0 || external.failed > 0 || external.skipped > 0) {
    console.log(
      `[TRADING] 외부 알림 처리: sent=${external.sent} failed=${external.failed} skipped=${external.skipped}`,
    );
  }
}

async function runDailyReportOnce() {
  if (!env.DAILY_REPORT_ENABLED) {
    console.log('[TRADING] DAILY_REPORT_ENABLED=false → 스킵');
    return;
  }

  const text = await buildDailyReportText();
  await sendTelegram(text);
  console.log('[TRADING] 하루 요약 전송 완료');
}

async function main() {
  const args = process.argv.slice(2);
  const isDaily = args.includes('--daily-report');

  if (isDaily) {
    await runDailyReportOnce();
    return;
  }

  await runChecksOnce();
}

main().catch((e) => {
  console.error(`[TRADING] 치명적 오류: ${(e as Error).message}`);
  process.exit(1);
});
