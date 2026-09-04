import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { Message } from '../models/Message';
import { sendMessageSchema, getMessagesQuerySchema, objectIdSchema } from '../utils/validation';
import { sanitizeMessageContent } from '../utils/sanitize';
import { HttpError } from '../middleware/errorHandler';
import { getOtherUser } from '../services/users';
import { recordMessageCount } from '../services/retention';
import { emitMessageCreated } from '../websocket/events';
import { Meta, MESSAGE_COUNTER_KEY } from '../models/Meta';

/**
 * GET /api/messages?limit=50&before=<messageId>
 *
 * Cursor-based pagination over the two users' shared conversation.
 * Never loads more than `limit` (max 100) documents. Returns newest-first;
 * the client reverses for display and asks for older pages via `before`.
 */
export async function getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = getMessagesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new HttpError(400, 'Invalid pagination parameters');
    }
    const { limit, before } = parsed.data;

    const currentUserId = req.session.userId as string;
    const otherUser = await getOtherUser(currentUserId, req.session);

    const pairFilter = {
      $or: [
        { senderId: currentUserId, receiverId: otherUser._id },
        { senderId: otherUser._id, receiverId: currentUserId },
      ],
    };

    const filter: Record<string, unknown> = { ...pairFilter };
    if (before) {
      filter._id = { $lt: new Types.ObjectId(before) };
    }

    // Projection keeps the payload lean; index on
    // (senderId, receiverId, createdAt) makes this an index scan, not a
    // collection scan, regardless of how many millions of documents exist.
    const docs = await Message.find(filter, {
      senderId: 1,
      receiverId: 1,
      content: 1,
      createdAt: 1,
    })
      .sort({ _id: -1 })
      .limit(limit)
      .lean();

    const nextCursor = docs.length === limit ? docs[docs.length - 1]._id.toString() : null;

    res.status(200).json({
      messages: docs.map((d) => ({
        id: d._id.toString(),
        senderId: d.senderId.toString(),
        receiverId: d.receiverId.toString(),
        content: d.content,
        createdAt: d.createdAt,
      })),
      nextCursor,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/messages
 * body: { content: string }
 *
 * The sender is ALWAYS the authenticated session user; the receiver is
 * ALWAYS resolved server-side as "the other authorized user". Nothing
 * about identity is trusted from the request body.
 */
export async function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Invalid message';
      throw new HttpError(400, message);
    }

    const cleanContent = sanitizeMessageContent(parsed.data.content);
    if (cleanContent.length === 0) {
      throw new HttpError(400, 'Message cannot be empty');
    }

    const currentUserId = req.session.userId as string;
    const otherUser = await getOtherUser(currentUserId, req.session);

    // Enforce the hard message cap. No new messages are allowed until the admin
    // exports and resets the database.
    const maxMessages = Number(process.env.MAX_MESSAGES) || 5_000_000;
    const meta = await Meta.findOne({ key: MESSAGE_COUNTER_KEY }).lean();
    const currentCount = meta?.messageCount || 0;

    if (currentCount >= maxMessages) {
      throw new HttpError(403, 'Message limit reached. Please ask the administrator to export and reset the database.');
    }

    const created = await Message.create({
      senderId: currentUserId,
      receiverId: otherUser._id,
      content: cleanContent,
    });

    // Fire-and-forget-ish: retention bookkeeping shouldn't block the
    // response, but we still await it here to keep the counter accurate
    // under test/low scale. At real scale this could be queued instead.
    await recordMessageCount();

    emitMessageCreated(created);

    res.status(201).json({
      message: {
        id: created._id.toString(),
        senderId: created.senderId.toString(),
        receiverId: created.receiverId.toString(),
        content: created.content,
        createdAt: created.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/messages/:id
 * Only the original sender may delete their own message.
 */
export async function deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idParsed = objectIdSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      throw new HttpError(400, 'Invalid message id');
    }

    const currentUserId = req.session.userId as string;

    const message = await Message.findById(idParsed.data);
    if (!message) {
      throw new HttpError(404, 'Message not found');
    }

    if (message.senderId.toString() !== currentUserId) {
      // Do not distinguish "not yours" from "doesn't exist" to avoid
      // leaking existence of arbitrary ids.
      throw new HttpError(404, 'Message not found');
    }

    await message.deleteOne();

    await Meta_decrementSafely();

    res.status(200).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// Keep the message counter consistent on manual deletes too.
async function Meta_decrementSafely(): Promise<void> {
  const { Meta, MESSAGE_COUNTER_KEY } = await import('../models/Meta');
  await Meta.updateOne({ key: MESSAGE_COUNTER_KEY }, { $inc: { messageCount: -1 } });
}
