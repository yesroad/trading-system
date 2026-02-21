import { request } from 'node:https';
import { sleep } from '@workspace/shared-utils';
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

async function postTelegram(text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const body = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };

  const payload = JSON.stringify(body);

  const responseText = await new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        family: 4, // IPv6 라우팅 이슈 환경 대응
        timeout: 10_000,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload)),
        },
      },
      (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(`텔레그램 HTTP 오류: ${statusCode} ${res.statusMessage ?? ''}`.trim()),
            );
            return;
          }
          resolve(raw);
        });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('request timeout'));
    });

    req.on('error', (error) => {
      reject(new Error(`텔레그램 API 요청 실패: ${formatUnknownError(error)}`));
    });

    req.write(payload);
    req.end();
  });

  let data: TelegramResponse;
  try {
    data = JSON.parse(responseText) as TelegramResponse;
  } catch (error: unknown) {
    throw new Error(`텔레그램 응답 파싱 실패: ${formatUnknownError(error)}`);
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
