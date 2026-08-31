import { Router } from 'express';
import { login, logout, me } from '../controllers/auth.controller';
import { loginRateLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/auth';
import { requireCsrfToken } from '../middleware/csrf';

const router = Router();

router.post('/login', loginRateLimiter, login);
router.post('/logout', requireAuth, requireCsrfToken, logout);
router.get('/me', requireAuth, me);

export default router;
