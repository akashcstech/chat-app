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
 *  1. Streams all messages as a CSV download.
 *  2. Only after the entire CSV has been flushed does it wipe the DB and
 *     reset the counter.
 *
 * The "export-then-wipe" is sequential and within a single HTTP response so
 * the client receives complete data before the deletion is committed.
 */
export async function exportAndReset(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // ── Guard: User 2 only ────────────────────────────────────────────────
    const currentUser = await User.findById(req.session.userId as string);
    if (!currentUser) throw new HttpError(401, 'Unauthorized');

    const user2Email = env.users.user2.email.toLowerCase();
    if (currentUser.email.toLowerCase() !== user2Email) {
      throw new HttpError(403, 'This action is restricted to the administrator account.');
    }

    // ── Fetch all messages with sender / receiver info ────────────────────
    const messages = await Message.find({})
      .sort({ createdAt: 1 })
      .populate<{ senderId: { username: string; email: string } }>('senderId', 'username email')
      .populate<{ receiverId: { username: string; email: string } }>('receiverId', 'username email')
      .lean();

    // ── Build CSV ─────────────────────────────────────────────────────────
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'senderEmail', title: 'Sender Email' },
        { id: 'senderUsername', title: 'Sender Username' },
        { id: 'receiverEmail', title: 'Receiver Email' },
        { id: 'content', title: 'Content' },
        { id: 'createdAt', title: 'Created At' },
      ],
    });

    const records = messages.map((m) => {
      const sender = m.senderId as unknown as { username: string; email: string };
      const receiver = m.receiverId as unknown as { username: string; email: string };
      return {
        id: m._id.toString(),
        senderEmail: sender?.email ?? '',
        senderUsername: sender?.username ?? '',
        receiverEmail: receiver?.email ?? '',
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      };
    });

    const csvBody =
      csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(records);

    // ── Send CSV headers & body ───────────────────────────────────────────
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="chat-export-${timestamp}.csv"`,
    );
    res.setHeader('Content-Length', Buffer.byteLength(csvBody, 'utf8'));

    // Write CSV and wait for the socket to flush before wiping.
    res.write(csvBody);
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
