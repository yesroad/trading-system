import { env } from '../config/env';

type TelegramResponse = {
  ok: boolean;
  description?: string;
};

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

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as TelegramResponse;

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
