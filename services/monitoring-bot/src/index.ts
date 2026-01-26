import { env } from './config/env';
import { formatMessage } from './alert/formatMessage';
import { sendTelegram } from './alert/sendTelegram';
import { shouldSendAlert, recordAlertSent } from './alert/alertCooldown';

import { checkWorkers } from './checks/checkWorkers';
import { checkCollectors } from './checks/checkCollectors';
import { checkIngestionRuns } from './checks/checkIngestionRuns';
import { checkAiResults } from './checks/checkAiResults';
import { buildDailyReportText } from './checks/dailyReport';

async function runChecksOnce() {
  const all = [
    ...(await checkWorkers()),
    ...(await checkCollectors()),
    ...(await checkIngestionRuns()),
    ...(await checkAiResults()),
  ];

  // WARN/CRIT만 알림
  const events = all.filter((e) => e.level !== 'OK');

  for (const e of events) {
    if (!shouldSendAlert(e)) continue;

    const text = formatMessage(e);
    await sendTelegram(text);
    recordAlertSent(e);
  }

  if (events.length === 0) {
    console.log('[TRADING] 이상 징후 없음');
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
