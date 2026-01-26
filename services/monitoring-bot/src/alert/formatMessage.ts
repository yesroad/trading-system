import { LEVEL_EMOJI } from '../types/status';
import type { AlertEvent } from '../types/status';
import { env } from '../config/env';

export function formatMessage(event: AlertEvent) {
  const { level, title, message, market, service, runMode, at } = event;
  const subject = service ? `${service}${runMode ? ` (${runMode})` : ''}` : '-';

  return `
${env.ALERT_PREFIX} ${LEVEL_EMOJI[level]} ${level}
- 시장: ${market}
- 유형: ${title}
- 대상: ${subject}
- 내용: ${message}
- 시간: ${at}
`.trim();
}
