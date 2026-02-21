import { envOptionalServer } from '@/lib/env.server';

const DEFAULT_ALLOWED_EMAILS = '';

function parseAllowedEmails(raw: string): Set<string> {
  return new Set(
    raw
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );
}

export function getAllowedEmails(): Set<string> {
  const raw = envOptionalServer('ALLOWED_EMAILS') ?? DEFAULT_ALLOWED_EMAILS;
  return parseAllowedEmails(raw);
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  const allowed = getAllowedEmails();
  if (allowed.size === 0) return false;
  if (!email) return false;

  return allowed.has(email.trim().toLowerCase());
}
