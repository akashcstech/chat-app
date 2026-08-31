import { User, IUser } from '../models/User';
import { HttpError } from '../middleware/errorHandler';

/**
 * This system supports exactly two authorized users. Given the currently
 * authenticated user's id, this returns the other one — never trusting a
 * client-supplied "receiverId". If the two-user invariant is ever
 * violated (e.g. someone manually inserts a third user), this fails
 * loudly rather than guessing.
 */
export async function getOtherUser(currentUserId: string): Promise<IUser> {
  const users = await User.find({ _id: { $ne: currentUserId } }).limit(2);

  if (users.length !== 1) {
    throw new HttpError(500, 'Chat is misconfigured. Expected exactly one other user.');
  }

  return users[0];
}
