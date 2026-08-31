import rateLimit from 'express-rate-limit';

/**
 * Login attempts: strict, per-IP limit to slow down credential stuffing /
 * brute force against the two known accounts.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
});

/**
 * General API rate limit as a safety net against abusive polling/scripts.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

/**
 * Tighter limit specifically on sending messages, independent of read
 * traffic.
 */
export const sendMessageRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are sending messages too quickly.' },
});
