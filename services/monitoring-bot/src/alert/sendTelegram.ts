import { env } from '../config/env.js';

type TelegramResponse = {
  ok: boolean;
  description?: string;
};

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) {
      return `${error.message} (cause: ${cause.message})`;
    }
    if (cause !== undefined && cause !== null) {
      return `${error.message} (cause: ${String(cause)})`;
    }
    return error.message;
  }
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function postTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error: unknown) {
    throw new Error(`텔레그램 API 요청 실패: ${formatUnknownError(error)}`);
  }

  let data: TelegramResponse;
  try {
    data = (await res.json()) as TelegramResponse;
  } catch (error: unknown) {
    throw new Error(`텔레그램 응답 파싱 실패: HTTP ${res.status} ${formatUnknownError(error)}`);
  }

  if (!res.ok) {
    throw new Error(`텔레그램 HTTP 오류: ${res.status} ${res.statusText}`);
  }

  if (!data.ok) {
    throw new Error(`텔레그램 전송 실패: ${data.description ?? 'unknown error'}`);
  }
}

export async function sendTelegram(
  text: string,
  meta?: { isCriticalRepeat?: boolean },
): Promise<void> {
  await postTelegram(text);

  // ✅ CRIT이면 1회 더 강조 전송(🔥)
  if (!env.CRIT_REPEAT_ENABLED) return;
  if (!meta?.isCriticalRepeat) return;

  const delayMs = Math.max(1, env.CRIT_REPEAT_DELAY_SEC) * 1000;
  await sleep(delayMs);

  const emphasized = `🔥🔥🔥\n${text}`;
  await postTelegram(emphasized);
}
