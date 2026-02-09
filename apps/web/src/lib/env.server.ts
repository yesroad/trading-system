import { requireEnv } from '@workspace/shared-utils';

export function envServer(name: string): string {
  const normalized = requireEnv(name).trim();
  if (!normalized) {
    throw new Error(`[web/api] 환경변수 누락: ${name}`);
  }
  return normalized;
}
