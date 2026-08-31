import { Request, Response, NextFunction } from 'express';

/**
 * Protects a route: rejects any request that doesn't carry a valid,
 * server-side session. The authenticated user id is taken exclusively
 * from `req.session.userId` — a value the server itself set at login.
 *
 * CRITICAL: no request body/query/header value is ever trusted as the
 * acting user's identity. Controllers must read `req.session.userId`,
 * never `req.body.userId` or similar.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session || !req.session.userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
