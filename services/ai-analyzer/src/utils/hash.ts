import crypto from 'node:crypto';

/**
 * 입력 기반 중복 방지용 해시
 * - 같은 window_end + 같은 요약 입력이면 재호출 방지
 */
export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}
