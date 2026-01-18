import "dotenv/config";

/**
 * 환경변수 유틸
 * - 누락 시 로그 한 줄 남기고 에러
 */
export function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[ai-analyzer] 환경변수 누락: ${name}`);
    throw new Error(`${name} is missing`);
  }
  return v;
}

/** 있으면 쓰고 없으면 기본값 */
export function envOptional(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** "true" / "false" 파싱 */
export function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null) return fallback;
  return v.toLowerCase() === "true";
}
