import { Message } from '../models/Message';
import { Meta, MESSAGE_COUNTER_KEY } from '../models/Meta';
import { env } from '../config/env';

/**
 * Call this after every successful message insert.
 *
 * Design goals (see spec section 10/11):
 *  - Never run `countDocuments()` on the hot path — maintain a counter
 *    document instead, updated atomically with `$inc`.
 *  - Don't do a cleanup check on every single insert — only every
 *    `RETENTION_CHECK_INTERVAL` inserts, to amortize the cost.
 *  - When the cap is exceeded, delete the oldest messages in a bounded
 *    batch (not one-by-one, not the entire excess in one query).
 */
export async function recordMessageAndMaybeTrim(): Promise<void> {
  const meta = await Meta.findOneAndUpdate(
    { key: MESSAGE_COUNTER_KEY },
    { $inc: { messageCount: 1 } },
    { upsert: true, new: true }
  );

  const count = meta.messageCount;

  if (count % env.retentionCheckInterval !== 0) {
    return;
  }

  if (count <= env.maxMessages) {
    return;
  }

  await trimOldestMessages();
}

async function trimOldestMessages(): Promise<void> {
  const excess = await Meta.findOne({ key: MESSAGE_COUNTER_KEY });
  if (!excess) return;

  let toDelete = excess.messageCount - env.maxMessages;
  if (toDelete <= 0) return;

  while (toDelete > 0) {
    const batchSize = Math.min(env.retentionBatchSize, toDelete);

    // Find the oldest `batchSize` message ids, then delete exactly those.
    // This avoids a full collection scan and keeps each operation small
    // and predictable even with millions of documents.
    const oldest = await Message.find({}, { _id: 1 })
      .sort({ createdAt: 1 })
      .limit(batchSize)
      .lean();

    if (oldest.length === 0) break;

    const ids = oldest.map((doc) => doc._id);
    const result = await Message.deleteMany({ _id: { $in: ids } });

    await Meta.updateOne(
      { key: MESSAGE_COUNTER_KEY },
      { $inc: { messageCount: -result.deletedCount } }
    );

    toDelete -= result.deletedCount;

    if (result.deletedCount === 0) break; // safety valve
  }
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
