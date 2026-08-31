import { Router } from 'express';
import { getStats, exportAndReset } from '../controllers/admin.controller';
import { requireAuth } from '../middleware/auth';
import { requireCsrfToken } from '../middleware/csrf';

const router = Router();

// Live capacity stats — all authenticated users can read this.
router.get('/stats', requireAuth, getStats);

// Export + wipe — User 2 only, CSRF-protected.
router.post('/export-and-reset', requireAuth, requireCsrfToken, exportAndReset);

export default router;
