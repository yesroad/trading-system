import { env, requireEnv } from '@workspace/shared-utils';

export function envServer(name: string): string {
  const normalized = requireEnv(name).trim();
  if (!normalized) {
    throw new Error(`[web/api] 환경변수 누락: ${name}`);
  }
  return normalized;
}

export function envOptionalServer(name: string): string | undefined {
  const raw = env(name);
  if (raw === undefined) return undefined;

  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function envBooleanServer(name: string, defaultValue: boolean): boolean {
  const raw = env(name);
  if (raw === undefined) return defaultValue;

  const normalized = raw.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return defaultValue;
}
