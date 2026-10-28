// Creates the single owner account (and their first store).
// Usage: npm run create-owner -- [--store "Do'kon nomi"] [--name "Ism"] [--login login] [--password parol]
// Missing values are asked for interactively.
import readline from 'node:readline/promises';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { prisma } from '@microstore/database';
import { createOwnerAccount } from '../controllers/authController.js';

dotenv.config();

const { values } = parseArgs({
  options: {
    store: { type: 'string' },
    name: { type: 'string' },
    login: { type: 'string' },
    password: { type: 'string' },
  },
});

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = async (value: string | undefined, question: string) => value ?? (await rl.question(question));

try {
  const { store, user } = await createOwnerAccount({
    storeName: await ask(values.store, "Do'kon nomi: "),
    name: await ask(values.name, 'Egasining ismi: '),
    login: await ask(values.login, 'Login yoki telefon raqam: '),
    password: await ask(values.password, 'Parol: '),
  });
  console.log(`✅ Do'kon egasi yaratildi: ${user.firstName} (login: ${user.telegramId}), do'kon: ${store.name}`);
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}
