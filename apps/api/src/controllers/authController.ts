import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma, Prisma } from '@microstore/database';
import { signToken } from '../utils/token.js';

const MIN_PASSWORD_LENGTH = 8;
const LOGIN_PATTERN = /^[a-z0-9._-]{3,32}$/;
// Used to keep response time similar when the login does not exist.
const DUMMY_HASH = bcrypt.hashSync('microstore-dummy-password', 10);

// Brute-force guard per login (on top of the per-IP limiter): MAX_FAILED_LOGINS wrong passwords within
// LOGIN_WINDOW_MS lock that login for LOGIN_WINDOW_MS. Unknown logins are counted the same way, so the
// lock does not reveal which logins exist.
const MAX_FAILED_LOGINS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; first: number; lockedUntil: number }>();

function loginLockMinutes(identifier: string): number {
  const left = (failedLogins.get(identifier)?.lockedUntil ?? 0) - Date.now();
  return left > 0 ? Math.ceil(left / 60000) : 0;
}

function recordFailedLogin(identifier: string) {
  const now = Date.now();
  let entry = failedLogins.get(identifier);
  if (!entry || now - entry.first > LOGIN_WINDOW_MS) entry = { count: 0, first: now, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_FAILED_LOGINS) entry.lockedUntil = now + LOGIN_WINDOW_MS;
  failedLogins.set(identifier, entry);

  if (failedLogins.size > 10000) {
    for (const [key, e] of failedLogins) {
      if (now - e.first > LOGIN_WINDOW_MS && e.lockedUntil < now) failedLogins.delete(key);
    }
  }
}

export function normalizePhone(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

function isPhoneLike(raw: string): boolean {
  return /^\+?\d{5,15}$/.test(raw.replace(/[\s\-()]/g, ''));
}

// Accepts either a phone number (normalized to +digits) or a text login (trimmed, lower-cased).
export function normalizeIdentifier(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return isPhoneLike(trimmed) ? normalizePhone(trimmed) : trimmed.toLowerCase();
}

function validateIdentifier(identifier: string): string | null {
  if (!identifier) return "Telefon raqam yoki login kiriting.";
  if (identifier.startsWith('+')) return null;
  if (!LOGIN_PATTERN.test(identifier)) {
    return "Login 3–32 ta belgidan iborat bo'lishi va faqat lotin harflari, raqam hamda _ . - belgilaridan tashkil topishi kerak (yoki telefon raqam kiriting).";
  }
  return null;
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const fail = (res: Response, status: number, code: string, message: string) =>
  res.status(status).json({ success: false, error: { code, message } });

type UserWithStore = {
  id: string;
  storeId: string;
  telegramId: string;
  firstName: string;
  role: string;
  passwordHash: string | null;
  store?: { name: string } | null;
};

export function userPayload(user: UserWithStore) {
  return {
    id: user.id,
    name: user.firstName,
    phone: user.telegramId,
    role: user.role,
    storeId: user.storeId,
    storeName: user.store?.name || '',
  };
}

// 1. Owner account: the system has a single owner, created from the command line (npm run create-owner).
export async function createOwnerAccount(input: { storeName: string; name: string; login: string; password: string }) {
  const identifier = normalizeIdentifier(input.login);
  const userName = input.name.trim();
  const sName = input.storeName.trim();
  const userPassword = input.password.trim();

  if (!identifier || !userName || !sName || !userPassword) {
    throw new Error("Barcha maydonlarni (Do'kon nomi, Ism, Telefon yoki Login va Parol) to'liq kiriting.");
  }

  const identifierError = validateIdentifier(identifier);
  if (identifierError) throw new Error(identifierError);

  if (userPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo'lishi kerak.`);
  }

  if ((await prisma.user.count({ where: { role: 'owner' } })) > 0) {
    throw new Error("Do'kon egasi allaqachon mavjud: tizimda faqat bitta ega bo'ladi.");
  }

  const existing = await prisma.user.findUnique({ where: { telegramId: identifier } });
  if (existing) throw new Error('Ushbu telefon raqam yoki login band.');

  const userId = crypto.randomUUID();
  const storeId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(userPassword, 10);

  const [store, user] = await prisma.$transaction([
    prisma.store.create({
      data: { id: storeId, name: sName, phone: isPhoneLike(identifier) ? identifier : null, ownerId: userId },
    }),
    prisma.user.create({
      data: {
        id: userId,
        storeId,
        telegramId: identifier,
        firstName: userName,
        username: identifier,
        passwordHash,
        role: 'owner',
      },
    }),
  ]);

  return { store, user };
}

// 2. Login (owners and cashiers)
export async function loginHandler(req: Request, res: Response) {
  try {
    const { phone, email, login, password } = req.body || {};
    const identifier = normalizeIdentifier(String(login || phone || email || ''));
    const userPassword = String(password || '').trim();

    if (!identifier || !userPassword) {
      return fail(res, 400, 'MISSING_FIELDS', 'Telefon raqam yoki login va parolni kiriting.');
    }

    const lockMinutes = loginLockMinutes(identifier);
    if (lockMinutes > 0) {
      return fail(res, 429, 'LOGIN_LOCKED', `Juda ko'p noto'g'ri urinish. ${lockMinutes} daqiqadan keyin qayta urinib ko'ring.`);
    }

    const invalid = () => {
      recordFailedLogin(identifier);
      return fail(res, 401, 'INVALID_CREDENTIALS', "Login yoki parol noto'g'ri!");
    };

    const user = await prisma.user.findUnique({ where: { telegramId: identifier }, include: { store: true } });
    // Accounts without a password cannot sign in with one.
    if (!user || !user.passwordHash) {
      await bcrypt.compare(userPassword, DUMMY_HASH);
      return invalid();
    }
    if (!(await bcrypt.compare(userPassword, user.passwordHash))) {
      return invalid();
    }

    failedLogins.delete(identifier);
    return res.status(200).json({
      success: true,
      token: signToken(user),
      store: { id: user.storeId, name: user.store?.name || '' },
      user: userPayload(user),
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Tizimga kirishda xatolik yuz berdi. Keyinroq urinib ko'ring.");
  }
}

// 3. Current session
export async function meHandler(req: Request, res: Response) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { store: true } });
    if (!user) return fail(res, 401, 'INVALID_TOKEN', 'Sessiya tugagan. Qayta kiring.');
    return res.status(200).json({ success: true, user: userPayload(user) });
  } catch (error) {
    console.error('Me error:', error);
    return fail(res, 500, 'SERVER_ERROR', 'Server xatosi.');
  }
}

// 4. Change own login and/or password
export async function updateCredentialsHandler(req: Request, res: Response) {
  try {
    const { currentPassword, newLogin, newPassword } = req.body || {};
    const current = String(currentPassword || '').trim();
    const wantsLogin = String(newLogin || '').trim() !== '';
    const wantsPassword = String(newPassword || '').trim() !== '';

    if (!current) return fail(res, 400, 'MISSING_FIELDS', 'Joriy parolni kiriting.');
    if (!wantsLogin && !wantsPassword) {
      return fail(res, 400, 'NOTHING_TO_UPDATE', 'Yangi login yoki yangi parolni kiriting.');
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId }, include: { store: true } });
    if (!user || !user.passwordHash) return fail(res, 401, 'INVALID_TOKEN', 'Sessiya tugagan. Qayta kiring.');

    if (!(await bcrypt.compare(current, user.passwordHash))) {
      return fail(res, 400, 'INVALID_PASSWORD', "Joriy parol noto'g'ri!");
    }

    const data: Prisma.UserUpdateInput = {};

    if (wantsLogin) {
      const identifier = normalizeIdentifier(String(newLogin));
      const identifierError = validateIdentifier(identifier);
      if (identifierError) return fail(res, 400, 'INVALID_LOGIN', identifierError);

      if (identifier !== user.telegramId) {
        const taken = await prisma.user.findUnique({ where: { telegramId: identifier } });
        if (taken) return fail(res, 400, 'USER_ALREADY_EXISTS', 'Bu login yoki telefon raqam band.');
        data.telegramId = identifier;
        data.username = identifier;
      }
    }

    if (wantsPassword) {
      const pw = String(newPassword).trim();
      if (pw.length < MIN_PASSWORD_LENGTH) {
        return fail(res, 400, 'PASSWORD_TOO_SHORT', `Yangi parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo'lishi kerak.`);
      }
      data.passwordHash = await bcrypt.hash(pw, 10);
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data, include: { store: true } });

    return res.status(200).json({
      success: true,
      message: "Ma'lumotlar muvaffaqiyatli yangilandi",
      token: signToken(updated),
      user: userPayload(updated),
    });
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      return fail(res, 400, 'USER_ALREADY_EXISTS', 'Bu login yoki telefon raqam band.');
    }
    console.error('Update credentials error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Ma'lumotlarni yangilashda xatolik yuz berdi.");
  }
}

// 5. Create cashier (owner only; belongs to the active store)
export async function createCashierHandler(req: Request, res: Response) {
  try {
    const { name, phone, login, password } = req.body || {};
    const identifier = normalizeIdentifier(String(login || phone || ''));
    const cashierName = String(name || '').trim();
    const cashierPassword = String(password || '').trim();

    if (!identifier || !cashierName || !cashierPassword) {
      return fail(res, 400, 'MISSING_FIELDS', "Sotuvchi ismi, telefon raqami (yoki logini) va parolini to'liq kiriting.");
    }

    const identifierError = validateIdentifier(identifier);
    if (identifierError) return fail(res, 400, 'INVALID_LOGIN', identifierError);

    if (cashierPassword.length < MIN_PASSWORD_LENGTH) {
      return fail(res, 400, 'PASSWORD_TOO_SHORT', `Parol kamida ${MIN_PASSWORD_LENGTH} ta belgidan iborat bo'lishi kerak.`);
    }

    const existing = await prisma.user.findUnique({ where: { telegramId: identifier } });
    if (existing) {
      return fail(res, 400, 'USER_ALREADY_EXISTS', 'Ushbu telefon raqam yoki login allaqachon mavjud!');
    }

    const cashier = await prisma.user.create({
      data: {
        storeId: req.storeId!,
        telegramId: identifier,
        firstName: cashierName,
        username: identifier,
        passwordHash: await bcrypt.hash(cashierPassword, 10),
        role: 'cashier',
      },
    });

    return res.status(201).json({
      success: true,
      message: "Yangi sotuvchi (kassir) muvaffaqiyatli qo'shildi",
      cashier: {
        id: cashier.id,
        name: cashier.firstName,
        phone: cashier.telegramId,
        role: cashier.role,
        storeId: cashier.storeId,
      },
    });
  } catch (error: any) {
    if (isUniqueViolation(error)) {
      return fail(res, 400, 'USER_ALREADY_EXISTS', 'Ushbu telefon raqam yoki login allaqachon mavjud!');
    }
    console.error('Create cashier error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Sotuvchi qo'shishda xatolik yuz berdi");
  }
}

// 6. List cashiers of the active store (owner only)
export async function getCashiersHandler(req: Request, res: Response) {
  try {
    const cashiers = await prisma.user.findMany({
      where: { storeId: req.storeId, role: 'cashier' },
      orderBy: { createdAt: 'asc' },
    });

    return res.status(200).json({
      success: true,
      cashiers: cashiers.map((c) => ({
        id: c.id,
        name: c.firstName,
        phone: c.telegramId,
        role: c.role,
        storeId: c.storeId,
      })),
    });
  } catch (error) {
    console.error('Get cashiers error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Sotuvchilar ro'yxatini olishda xatolik");
  }
}

// 7. Remove a cashier of the active store (owner only)
export async function deleteCashierHandler(req: Request, res: Response) {
  try {
    const removed = await prisma.user.deleteMany({
      where: { id: req.params.id, storeId: req.storeId, role: 'cashier' },
    });
    if (removed.count === 0) return fail(res, 404, 'NOT_FOUND', 'Sotuvchi topilmadi.');
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Delete cashier error:', error);
    return fail(res, 500, 'SERVER_ERROR', "Sotuvchini o'chirishda xatolik");
  }
}
