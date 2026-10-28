import crypto from 'crypto';

export class TelegramError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TelegramError';
    this.status = status;
  }
}

// Read at call time so the values from .env (loaded after imports) are used.
export const getBotToken = () => process.env.TELEGRAM_BOT_TOKEN || '';
export const isBotEnabled = () => getBotToken() !== '';
export const getAppUrl = () => (process.env.APP_URL || 'https://birzum.uz').replace(/\/+$/, '');
const getApiBase = () => (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

// Telegram echoes this value back in a header on every webhook call so we can reject forged requests.
export const getWebhookSecret = () =>
  crypto.createHmac('sha256', 'birzum-telegram-webhook').update(getBotToken()).digest('hex').slice(0, 48);

export const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function callTelegram<T = any>(method: string, payload: Record<string, unknown> = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/bot${getBotToken()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new TelegramError(`Telegram bilan aloqa yo'q (${method})`, 0);
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {}

  if (!response.ok || !data?.ok) {
    throw new TelegramError(data?.description || `Telegram ${method} xatosi`, data?.error_code || response.status);
  }
  return data.result as T;
}

export const webAppKeyboard = (text = '📱 Ilovani ochish') => ({
  inline_keyboard: [[{ text, web_app: { url: getAppUrl() } }]],
});

export function sendMessage(chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function setupBot() {
  if (!isBotEnabled()) {
    console.warn('🤖 TELEGRAM_BOT_TOKEN is not set: Telegram bot is disabled.');
    return;
  }

  await callTelegram('setWebhook', {
    url: `${getAppUrl()}/api/v1/telegram/webhook`,
    secret_token: getWebhookSecret(),
    allowed_updates: ['message'],
  });
  await callTelegram('setMyCommands', {
    commands: [
      { command: 'start', description: 'Botni ishga tushirish' },
      { command: 'bugun', description: "Bugungi tushum holati" },
      { command: 'qarzlar', description: "Muddati yaqin qarzlar" },
      { command: 'yordam', description: 'Yordam' },
    ],
  });
  await callTelegram('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Atigi', web_app: { url: getAppUrl() } },
  });
  console.log(`🤖 Telegram bot ready (webhook: ${getAppUrl()}/api/v1/telegram/webhook)`);
}
