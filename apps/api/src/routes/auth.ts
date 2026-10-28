import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authGuard, requireOwner } from '../middleware/auth.js';
import {
  loginHandler,
  meHandler,
  updateCredentialsHandler,
  createCashierHandler,
  getCashiersHandler,
  deleteCashierHandler,
} from '../controllers/authController.js';
import {
  telegramLoginHandler,
  linkTelegramHandler,
  unlinkTelegramHandler,
} from '../controllers/telegramController.js';

const router = Router();

// Per client IP: 10 failed attempts per 15 minutes (successful ones are not counted).
const credentialsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'TOO_MANY_ATTEMPTS', message: "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring." },
  },
});

// PUBLIC ROUTES (no JWT required). There is no sign-up: the owner is created with `npm run create-owner`, cashiers by the owner.
router.post('/login', credentialsLimiter, loginHandler);
router.post('/telegram', credentialsLimiter, telegramLoginHandler);

// PROTECTED ROUTES
router.use(authGuard);
router.get('/me', meHandler);
router.post('/telegram/link', linkTelegramHandler);
router.delete('/telegram/link', unlinkTelegramHandler);
router.put('/credentials', credentialsLimiter, updateCredentialsHandler);
router.post('/cashiers', requireOwner, createCashierHandler);
router.get('/cashiers', requireOwner, getCashiersHandler);
router.delete('/cashiers/:id', requireOwner, deleteCashierHandler);

export default router;
