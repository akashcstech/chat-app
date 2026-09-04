import { Request, Response, NextFunction } from 'express';
import { createObjectCsvStringifier } from 'csv-writer';
import { Message } from '../models/Message';
import { Meta, MESSAGE_COUNTER_KEY } from '../models/Meta';
import { User } from '../models/User';
import { env } from '../config/env';
import { HttpError } from '../middleware/errorHandler';

const CAP = env.maxMessages; // 500,000

/**
 * GET /api/admin/stats
 * Returns the current message count so the UI can show the capacity bar.
 * Available to ALL authenticated users.
 */
export async function getStats(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const meta = await Meta.findOne({ key: MESSAGE_COUNTER_KEY }).lean();
    const count = meta?.messageCount ?? 0;
    res.status(200).json({ messageCount: count, cap: CAP });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/export-and-reset
 *
 * ADMIN ONLY (User 2 resolved from env):
 *  1. Streams all messages as a CSV download via a Mongoose cursor so the
 *     entire collection is never loaded into memory at once.
 *  2. Only after the entire CSV has been flushed does it wipe the DB and
 *     reset the counter.
 *
 * Streaming strategy:
 *  - We open a Mongoose QueryCursor on the Message collection.
 *  - We pre-fetch both user documents once (2 DB round trips total, not 2N).
 *  - Each batch of BATCH_SIZE documents is serialised to CSV and written to
 *    the response, keeping peak memory proportional to BATCH_SIZE rather
 *    than to the total number of messages.
 */
export async function exportAndReset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const BATCH_SIZE = 500;

  try {
    // ── Guard: User 2 only ────────────────────────────────────────────────
    const currentUser = await User.findById(req.session.userId as string);
    if (!currentUser) throw new HttpError(401, 'Unauthorized');

    const user2Email = env.users.user2.email.toLowerCase();
    if (currentUser.email.toLowerCase() !== user2Email) {
      throw new HttpError(403, 'This action is restricted to the administrator account.');
    }

    // ── Pre-fetch both users once (2 queries, not 2 per message) ─────────
    const allUsers = await User.find({}, { _id: 1, username: 1, email: 1 }).lean();
    const userMap = new Map(allUsers.map((u) => [u._id.toString(), u]));

    // ── Build CSV stringifier ─────────────────────────────────────────────
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id',              title: 'ID' },
        { id: 'senderEmail',     title: 'Sender Email' },
        { id: 'senderUsername',  title: 'Sender Username' },
        { id: 'receiverEmail',   title: 'Receiver Email' },
        { id: 'content',         title: 'Content' },
        { id: 'createdAt',       title: 'Created At' },
      ],
    });

    // ── Send CSV headers ──────────────────────────────────────────────────
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="chat-export-${timestamp}.csv"`,
    );
    // Tell compression middleware to skip this response — we are streaming raw
    // bytes and compressing a chunked transfer adds complexity without benefit.
    res.setHeader('Cache-Control', 'no-transform');
    // Node.js sets Transfer-Encoding: chunked automatically for streaming
    // responses. Setting it explicitly can confuse some middleware stacks.

    // Write CSV header row first.
    res.write(csvStringifier.getHeaderString());

    // ── Stream messages in batches ────────────────────────────────────────
    const cursor = Message.find({})
      .sort({ createdAt: 1 })
      .select({ senderId: 1, receiverId: 1, content: 1, createdAt: 1 })
      .lean()
      .cursor({ batchSize: BATCH_SIZE });

    let batch: {
      id: string;
      senderEmail: string;
      senderUsername: string;
      receiverEmail: string;
      content: string;
      createdAt: string;
    }[] = [];

    try {
      for await (const msg of cursor) {
        const sender   = userMap.get(msg.senderId.toString());
        const receiver = userMap.get(msg.receiverId.toString());

        batch.push({
          id:              msg._id.toString(),
          senderEmail:     sender?.email     ?? '',
          senderUsername:  sender?.username  ?? '',
          receiverEmail:   receiver?.email   ?? '',
          content:         msg.content,
          createdAt:       new Date(msg.createdAt).toISOString(),
        });

        if (batch.length >= BATCH_SIZE) {
          res.write(csvStringifier.stringifyRecords(batch));
          batch = [];
        }
      }

      // Flush any remaining records.
      if (batch.length > 0) {
        res.write(csvStringifier.stringifyRecords(batch));
      }
    } catch (streamErr) {
      // An error mid-stream: headers are already sent so we can't return an
      // HTTP error code. End the connection cleanly and log, then bail out
      // WITHOUT wiping the database — data is still safe.
      console.error('[export] streaming error — aborting, DB untouched:', streamErr);
      res.end();
      return;
    }

    // Wait for the socket to fully flush before wiping data.
    await new Promise<void>((resolve) => res.end(resolve));

    // ── Wipe messages & reset counter ─────────────────────────────────────
    await Message.deleteMany({});
    await Meta.updateOne(
      { key: MESSAGE_COUNTER_KEY },
      { $set: { messageCount: 0 } },
      { upsert: true },
    );
  } catch (err) {
    next(err);
  }
}
