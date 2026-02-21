'use client';

import { createBrowserClient } from '@supabase/ssr';

const browserClients = new Map<string, ReturnType<typeof createBrowserClient>>();

export function createSupabaseBrowserClient(url: string, anonKey: string) {
  const normalizedUrl = url.trim();
  const normalizedAnonKey = anonKey.trim();
  if (!normalizedUrl || !normalizedAnonKey) {
    throw new Error('Supabase 공개 환경변수가 비어 있습니다.');
  }

  const cacheKey = `${normalizedUrl}::${normalizedAnonKey}`;
  const cached = browserClients.get(cacheKey);
  if (cached) return cached;

  const client = createBrowserClient(normalizedUrl, normalizedAnonKey);
  browserClients.set(cacheKey, client);
  return client;
}
