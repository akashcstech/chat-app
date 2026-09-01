import { Request, Response, NextFunction } from 'express';
import { User } from '../models/User';
import { verifyPassword } from '../utils/password';
import { loginSchema } from '../utils/validation';
import { generateCsrfToken } from '../middleware/csrf';
import { HttpError } from '../middleware/errorHandler';
import { env } from '../config/env';

const GENERIC_INVALID_CREDENTIALS = 'Invalid email or password';

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      // Same generic message for validation failures as for wrong
      // credentials — don't reveal which part was wrong.
      throw new HttpError(400, GENERIC_INVALID_CREDENTIALS);
    }
    const { email, password } = parsed.data;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      // Constant-ish response shape/timing regardless of whether the user
      // exists — avoids user enumeration via response differences.
      await verifyPassword('$argon2id$v=19$m=65536,t=3,p=1$00000000000000000000000000000000$0000000000000000000000000000000000000000000000000000000000000000', password);
      throw new HttpError(401, GENERIC_INVALID_CREDENTIALS);
    }

    const ok = await verifyPassword(user.passwordHash, password);
    if (!ok) {
      throw new HttpError(401, GENERIC_INVALID_CREDENTIALS);
    }

    // Regenerate the session on privilege change (login) to prevent
    // session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user._id.toString();
      req.session.csrfToken = generateCsrfToken();

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        res.status(200).json({
          user: { id: user._id.toString(), username: user.username, email: user.email, isAdmin: user.email.toLowerCase() === env.users.user2.email.toLowerCase() },
          csrfToken: req.session.csrfToken,
        });
      });
    });
  } catch (err) {
    next(err);
  }
}

export function logout(req: Request, res: Response, next: NextFunction): void {
  const cookieName = 'chat.sid';
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie(cookieName);
    res.status(200).json({ ok: true });
  });
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.session.userId) {
      throw new HttpError(401, 'Unauthorized');
    }
    const user = await User.findById(req.session.userId);
    if (!user) {
      throw new HttpError(401, 'Unauthorized');
    }
    res.status(200).json({
      user: { id: user._id.toString(), username: user.username, email: user.email, isAdmin: user.email.toLowerCase() === env.users.user2.email.toLowerCase() },
      csrfToken: req.session.csrfToken,
    });
  } catch (err) {
    next(err);
  }
}
