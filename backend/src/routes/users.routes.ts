import { Router } from 'express';
import { getPeer } from '../controllers/users.controller';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/peer', requireAuth, getPeer);

export default router;
