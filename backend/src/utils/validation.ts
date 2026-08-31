import { z } from 'zod';
import { Types } from 'mongoose';

export const loginSchema = z.object({
  email: z.string().trim().min(3).max(254).email(),
  password: z.string().min(1).max(200),
});

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(4000, 'Message is too long (max 4000 characters)'),
});

export const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: 'Invalid id',
});

export const getMessagesQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : 50))
    .refine((v) => Number.isInteger(v) && v > 0 && v <= 100, {
      message: 'limit must be an integer between 1 and 100',
    }),
  before: z
    .string()
    .optional()
    .refine((v) => v === undefined || Types.ObjectId.isValid(v), {
      message: 'before must be a valid message id',
    }),
});
