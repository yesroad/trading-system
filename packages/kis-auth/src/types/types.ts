/**
 * 공통 타입 정의
 */

export type Nullable<T> = T | null;

export type KisTokenResponse = {
  access_token: string;
  expires_in: number; // seconds
};

export type SystemGuardKisToken = {
  kis_token_value: Nullable<string>;
  kis_token_expires_at: Nullable<string>;
  kis_token_last_issued_at: Nullable<string>;
  kis_token_issue_count: number;
  kis_token_last_error_at: Nullable<string>;
  kis_token_last_error_message: Nullable<string>;
  token_cooldown_until: Nullable<string>;
};
