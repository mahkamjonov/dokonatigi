import crypto from 'crypto';
import { Request, Response } from 'express';
import { prisma } from '@microstore/database';
import { signToken } from '../utils/token.js';
import { verifyWebAppInitData } from '../utils/telegramInitData.js';
import {
  getBotToken,
  getWebhookSecret,
  isBotEnabled,
  sendMessage,
  webAppKeyboard,
  escapeHtml,
} from '../services/telegram.js';
import { buildDebtOverviewText, findPendingDebts, getUserStores, localParts } from '../services/reminders.js';
import { userPayload } from './authController.js';

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const money = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

const HELP_TEXT =
  "🤖 <b>Atigi boti</b>\n\n/bugun — bugungi tushum holati\n/qarzlar — muddati yaqin qarzlar\n/yordam — shu yordam\n\nIlovani ochish uchun pastdagi tugmadan foydalaning. Bugungi tushum kiritilmasa va qarz muddati yaqinlashsa, soat 21:00 da eslatib turaman.";

type BotUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findFirst>>>;

async function todayStatusText(user: BotUser): Promise<string> {
  const { date } = localParts(new Date());
  const stores = await getUserStores(user);
  const revenues = await prisma.dailyRevenue.findMany({
    where: { storeId: { in: stores.map((s) => s.id) }, entryDate: date, isArchived: false },
  });
  const byStore = new Map(revenues.map((r) => [r.storeId, r]));

  const lines = stores.map((store) => {
    const revenue = byStore.get(store.id);
    if (!revenue) return `❌ <b>${escapeHtml(store.name)}</b>: kiritilmagan`;
    return `✅ <b>${escapeHtml(store.name)}</b>: ${money(revenue.totalAmount)} so'm\n    Naqd ${money(revenue.cashAmount)} · Terminal ${money(revenue.terminalAmount)} · Xolis ${money(revenue.xolisAmount)}`;
  });

  return `📊 <b>Bugungi tushum (${date})</b>\n\n${lines.join('\n\n')}`;
}

async function debtStatusText(user: BotUser): Promise<string> {
  if (user.role === 'cashier') return "Qarzlar bo'limi faqat do'kon egasi uchun ochiq.";

  const { date } = localParts(new Date());
  const stores = await getUserStores(user);
  return buildDebtOverviewText(await findPendingDebts(stores, date), stores.length > 1);
}

async function handleMessage(message: any) {
  if (!message?.text || message.chat?.type !== 'private' || !message.from) return;

  const chatId: number = message.chat.id;
  const command = String(message.text).trim().split(/\s+/)[0].split('@')[0].toLowerCase();
  const user = await prisma.user.findUnique({ where: { telegramUserId: String(message.from.id) } });

  if (!user) {
    await sendMessage(
      chatId,
      "👋 <b>Atigi botiga xush kelibsiz!</b>\n\nHisobingiz hali ulanmagan. Ilovani oching va login (yoki telefon raqam) bilan bir marta kiring — shundan keyin Telegram orqali parolsiz kirasiz va eslatmalarni shu yerda olasiz.",
      { reply_markup: webAppKeyboard('📱 Ilovani ochish va kirish') }
    );
    return;
  }

  if (command === '/start') {
    // Remember where to send reminders (also re-enables them after the user blocked and unblocked the bot).
    await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: String(chatId) } });
    await sendMessage(
      chatId,
      `👋 Salom, <b>${escapeHtml(user.firstName)}</b>!\n\nBugungi tushum kiritilmasa va ta'minotchi qarzi muddati yaqinlashsa, soat 21:00 da shu yerda eslatib turaman.\n\n/bugun — bugungi tushum holati\n/qarzlar — muddati yaqin qarzlar`,
      { reply_markup: webAppKeyboard() }
    );
    return;
  }

  if (command === '/bugun') {
    await sendMessage(chatId, await todayStatusText(user), { reply_markup: webAppKeyboard() });
    return;
  }

  if (command === '/qarzlar') {
    await sendMessage(chatId, await debtStatusText(user), { reply_markup: webAppKeyboard() });
    return;
  }

  await sendMessage(chatId, HELP_TEXT, { reply_markup: webAppKeyboard() });
}

export async function telegramWebhookHandler(req: Request, res: Response) {
  if (!isBotEnabled()) return res.sendStatus(404);

  const secret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  if (!safeEqual(secret, getWebhookSecret())) return res.sendStatus(401);

  // Acknowledge first: Telegram retries slow or failed webhooks.
  res.sendStatus(200);

  try {
    await handleMessage(req.body?.message);
  } catch (error) {
    console.error('Telegram webhook error:', error);
  }
}

// Mini App sign-in for accounts that were linked before.
export async function telegramLoginHandler(req: Request, res: Response) {
  if (!isBotEnabled()) return fail(res, 503, 'BOT_DISABLED', 'Telegram orqali kirish sozlanmagan.');

  const telegramUser = verifyWebAppInitData(String(req.body?.initData || ''), getBotToken());
  if (!telegramUser) {
    return fail(res, 401, 'INVALID_TELEGRAM_DATA', "Telegram ma'lumotlari yaroqsiz. Ilovani qayta oching.");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { telegramUserId: String(telegramUser.id) },
      include: { store: true },
    });
    if (!user) {
      return fail(res, 401, 'TELEGRAM_NOT_LINKED', "Telegram hisobi hali ulanmagan. Login va parol bilan kiring.");
    }

    return res.status(200).json({
      success: true,
      token: signToken(user),
      store: { id: user.storeId, name: user.store?.name || '' },
      user: userPayload(user),
    });
  } catch (error) {
    console.error('Telegram login error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Tizimga kirishda xatolik yuz berdi.");
  }
}

// Links the signed-in account to the Telegram user that opened the Mini App.
export async function linkTelegramHandler(req: Request, res: Response) {
  if (!isBotEnabled()) return fail(res, 503, 'BOT_DISABLED', 'Telegram sozlanmagan.');

  const telegramUser = verifyWebAppInitData(String(req.body?.initData || ''), getBotToken());
  if (!telegramUser) {
    return fail(res, 401, 'INVALID_TELEGRAM_DATA', "Telegram ma'lumotlari yaroqsiz. Ilovani qayta oching.");
  }

  try {
    const telegramId = String(telegramUser.id);

    // The Mini App re-links on every open: stay quiet when nothing changes.
    const current = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { telegramUserId: true, telegramChatId: true },
    });
    if (current?.telegramUserId === telegramId && current.telegramChatId === telegramId) {
      return res.status(200).json({ success: true, botStarted: true, alreadyLinked: true });
    }

    // One Telegram account belongs to one Atigi account at a time.
    await prisma.$transaction([
      prisma.user.updateMany({
        where: { telegramUserId: telegramId, NOT: { id: req.userId } },
        data: { telegramUserId: null, telegramChatId: null },
      }),
      prisma.user.update({
        where: { id: req.userId },
        data: { telegramUserId: telegramId, telegramChatId: telegramId },
      }),
    ]);

    // Confirms the bot can reach the user: Telegram only allows messages after the user pressed Start.
    let botStarted = true;
    try {
      await sendMessage(
        telegramId,
        "✅ <b>Hisobingiz ulandi!</b>\n\nEndi ilovaga Telegram orqali parolsiz kirasiz. Bugungi tushum kiritilmasa va qarz muddati yaqinlashsa, soat 21:00 da shu yerda eslatib turaman.\n\n/bugun — bugungi tushum holati\n/qarzlar — muddati yaqin qarzlar",
        { reply_markup: webAppKeyboard() }
      );
    } catch {
      botStarted = false;
      await prisma.user.update({ where: { id: req.userId }, data: { telegramChatId: null } });
    }

    return res.status(200).json({ success: true, botStarted });
  } catch (error) {
    console.error('Link telegram error:', error);
    return fail(res, 500, 'SERVER_ERROR', 'Telegram hisobini ulashda xatolik yuz berdi.');
  }
}

export async function unlinkTelegramHandler(req: Request, res: Response) {
  try {
    await prisma.user.update({
      where: { id: req.userId },
      data: { telegramUserId: null, telegramChatId: null },
    });
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Unlink telegram error:', error);
    return fail(res, 500, 'SERVER_ERROR', 'Telegram hisobini uzishda xatolik yuz berdi.');
  }
}
