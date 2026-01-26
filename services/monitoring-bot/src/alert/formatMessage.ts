import { LEVEL_EMOJI } from '../types/status';
import type { AlertLevel } from '../types/status';
import { env } from '../config/env';

export function formatMessage(params: {
  level: AlertLevel;
  service: string;
  runMode: string;
  message: string;
}) {
  const { level, service, runMode, message } = params;

  return `
${env.ALERT_PREFIX} ${LEVEL_EMOJI[level]} ${level}
- 서비스: ${service}
- 모드: ${runMode}
- 내용: ${message}
- 시간: ${new Date().toISOString()}
`.trim();
}
