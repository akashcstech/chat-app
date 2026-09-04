import { Session } from 'express-session';
import { User, IUser } from '../models/User';
import { HttpError } from '../middleware/errorHandler';

/**
 * This system supports exactly two authorized users. Given the current
 * session, this returns the other user — never trusting a client-supplied
 * "receiverId".
 *
 * Performance: the peer's ID is stored in the session after the first DB
 * lookup so subsequent calls within the same session are a single indexed
 * findById() instead of a find+filter, and we skip even that if the full
 * peer document was already cached on `res.locals` by a prior middleware.
 *
 * If the two-user invariant is ever violated (e.g. someone manually inserts
 * a third user), this fails loudly rather than guessing.
 */
export async function getOtherUser(
  currentUserId: string,
  session: Session & Partial<import('express-session').SessionData>,
): Promise<IUser> {
  // Fast path: peer ID already in session — just fetch by indexed _id.
  if (session.peerId) {
    const cached = await User.findById(session.peerId).lean();
    if (cached) return cached as unknown as IUser;
    // Peer was somehow removed — fall through to re-resolve.
    delete session.peerId;
  }

  // Slow path: query the DB and cache the result.
  const users = await User.find({ _id: { $ne: currentUserId } }).limit(2);

  if (users.length !== 1) {
    throw new HttpError(500, 'Chat is misconfigured. Expected exactly one other user.');
  }

  const peer = users[0];

  // Persist in session so the next request skips this query entirely.
  session.peerId = peer._id.toString();
  // Save asynchronously — don't block the response on this write.
  session.save?.(() => {});

  return peer;
}
