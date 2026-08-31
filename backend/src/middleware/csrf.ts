import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Double-submit-cookie CSRF protection.
 *
 * On login we generate a random token, store it in the (server-side)
 * session, and also send it back to the client in the JSON response body
 * so a same-origin script can read it and echo it back as a header. A
 * cross-site form/script cannot read response bodies of an authenticated
 * request it triggers, nor can it read our session cookie (HttpOnly), so
 * it cannot forge the `X-CSRF-Token` header.
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function requireCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const sessionToken = req.session?.csrfToken;
  const headerToken = req.header('X-CSRF-Token');

  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    res.status(403).json({ error: 'Invalid or missing CSRF token' });
    return;
  }

  next();
}
