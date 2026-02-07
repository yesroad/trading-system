import { env } from './config/env';
import { formatMessage } from './alert/formatMessage';
import { sendTelegram } from './alert/sendTelegram';
import { shouldSendAlert, recordAlertSent } from './alert/alertCooldown';

import { checkWorkers } from './checks/checkWorkers';
import { checkIngestionRuns } from './checks/checkIngestionRuns';
import { checkAiResults } from './checks/checkAiResults';
import { checkNotificationEvents } from './checks/checkNotificationEvents';
import { buildDailyReportText } from './checks/dailyReport';

async function runChecksOnce() {
  const all = [
    ...(await checkWorkers()),
    ...(await checkIngestionRuns()),
    ...(await checkAiResults()),
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
