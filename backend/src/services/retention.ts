import { Message } from '../models/Message';
import { Meta, MESSAGE_COUNTER_KEY } from '../models/Meta';

/**
 * Call this after every successful message insert.
 *
 * Design goals:
 *  - Never run `countDocuments()` on the hot path — maintain a counter
 *    document instead, updated atomically with `$inc`.
 */
export async function recordMessageCount(): Promise<void> {
  await Meta.findOneAndUpdate(
    { key: MESSAGE_COUNTER_KEY },
    { $inc: { messageCount: 1 } },
    { upsert: true, new: true }
  );
}

/**
 * Recomputes the counter from the actual collection. Intended for the seed
 * script / ops tooling — not called on the request hot path.
 */
export async function resyncMessageCounter(): Promise<number> {
  const count = await Message.countDocuments();
  await Meta.findOneAndUpdate(
    { key: MESSAGE_COUNTER_KEY },
    { $set: { messageCount: count } },
    { upsert: true }
  );
  return count;
}
