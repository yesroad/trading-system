import { LEVEL_EMOJI } from '../types/status.js';
import type { AlertEvent } from '../types/status.js';
import { env } from '../config/env.js';
import { marketLabel, toKstDisplay } from '../utils/time.js';

export function formatMessage(event: AlertEvent) {
  const { level, title, message, market, service, runMode, at } = event;
  const subject = service ? `${service}${runMode ? ` (${runMode})` : ''}` : '-';

  return `
${env.ALERT_PREFIX} ${LEVEL_EMOJI[level]} ${level}
- 시장: ${marketLabel(market)}
- 유형: ${title}
- 대상: ${subject}
- 내용: ${message}
- 시간: ${toKstDisplay(at)} (KST)
`.trim();
}
