import { Request, Response, NextFunction } from 'express';
import { getOtherUser } from '../services/users';
import { HttpError } from '../middleware/errorHandler';

/**
 * GET /api/users/peer
 * Returns the public profile of the other authorised user relative to the
 * currently authenticated session. Used by the frontend chat header.
 */
export async function getPeer(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.session.userId) {
      throw new HttpError(401, 'Unauthorized');
    }
    const peer = await getOtherUser(req.session.userId, req.session);
    res.status(200).json({
      user: {
        id: peer._id.toString(),
        username: peer.username,
        email: peer.email,
      },
    });
  } catch (err) {
    next(err);
  }
}
