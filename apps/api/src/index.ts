import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

import { authGuard, requireOwner } from './middleware/auth.js';
import authRouter from './routes/auth.js';
import { getRevenuesHandler, upsertRevenueHandler } from './controllers/revenueController.js';
import {
  getSuppliersHandler,
  createSupplierHandler,
  createTransactionHandler,
  createSupplierDebtHandler,
  deleteSupplierDebtHandler,
  paySupplierDebtHandler,
} from './controllers/supplierController.js';
import { getExpensesHandler, createExpenseHandler, deleteExpenseHandler } from './controllers/expenseController.js';
import { getAnalyticsHandler } from './controllers/analyticsController.js';
import {
  getStoresHandler,
  createStoreHandler,
  deleteStoreHandler,
  getSettingsHandler,
  updateSettingsHandler,
  backfillStoreOwners,
} from './controllers/storeController.js';
import { telegramWebhookHandler } from './controllers/telegramController.js';
import { setupBot } from './services/telegram.js';
import { startReminderScheduler } from './services/reminders.js';
import { getJwtSecret } from './utils/token.js';

dotenv.config();

getJwtSecret();
if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET is not set: using an insecure development secret.');
}

const app = express();
const PORT = process.env.PORT || 3000;

// Running behind Nginx: use the real client IP (needed for per-client rate limiting).
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Tx-Id', 'Accept', 'X-Store-Id', 'x-store-id'],
    credentials: true,
  })
);
app.options('*', cors());
app.use(express.json());

// Telegram calls this from a few fixed servers: keep it out of the per-IP API limiter (it is authenticated by a secret header).
app.post('/api/v1/telegram/webhook', telegramWebhookHandler);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// Health check ping (Public)
app.get('/api/v1/health/ping', (req, res) => {
  res.status(200).json({ status: 'UP', service: 'Atigi API', timestamp: new Date().toISOString() });
});

// Authentication (public login/register + protected profile and cashier routes)
app.use('/api/v1/auth', authRouter);

// Stores & per-store settings
app.get('/api/v1/stores', authGuard, getStoresHandler);
app.post('/api/v1/stores', authGuard, requireOwner, createStoreHandler);
app.delete('/api/v1/stores/:id', authGuard, requireOwner, deleteStoreHandler);
app.get('/api/v1/settings', authGuard, requireOwner, getSettingsHandler);
app.put('/api/v1/settings', authGuard, requireOwner, updateSettingsHandler);

// Daily revenue (owners and cashiers)
app.get('/api/v1/revenues', authGuard, getRevenuesHandler);
app.post('/api/v1/revenues', authGuard, upsertRevenueHandler);

// Suppliers & debts (owner only)
app.get('/api/v1/suppliers', authGuard, requireOwner, getSuppliersHandler);
app.post('/api/v1/suppliers', authGuard, requireOwner, createSupplierHandler);
app.post('/api/v1/suppliers/:id/transaction', authGuard, requireOwner, createTransactionHandler);
app.post('/api/v1/suppliers/:id/debts', authGuard, requireOwner, createSupplierDebtHandler);
app.delete('/api/v1/suppliers/:supplierId/debts/:debtId', authGuard, requireOwner, deleteSupplierDebtHandler);
app.patch('/api/v1/suppliers/:supplierId/debts/:debtId/pay', authGuard, requireOwner, paySupplierDebtHandler);

// Expenses (owner only)
app.get('/api/v1/expenses', authGuard, requireOwner, getExpensesHandler);
app.post('/api/v1/expenses', authGuard, requireOwner, createExpenseHandler);
app.delete('/api/v1/expenses/:id', authGuard, requireOwner, deleteExpenseHandler);

// Analytics (owner only)
app.get('/api/v1/analytics', authGuard, requireOwner, getAnalyticsHandler);

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`🚀 Atigi API server running on port ${PORT}`);
    setupBot().catch((err) => console.error('Telegram bot setup failed:', err));
    startReminderScheduler();
    backfillStoreOwners().catch((err) => console.error('Store ownership backfill failed:', err));
  });
}

export default app;
