import { Router } from 'express';
import { getMessages, sendMessage, deleteMessage } from '../controllers/messages.controller';
import { requireAuth } from '../middleware/auth';
import { requireCsrfToken } from '../middleware/csrf';
import { sendMessageRateLimiter } from '../middleware/rateLimit';

const router = Router();

router.use(requireAuth);

router.get('/', getMessages);
router.post('/', sendMessageRateLimiter, requireCsrfToken, sendMessage);
router.delete('/:id', requireCsrfToken, deleteMessage);

export default router;
