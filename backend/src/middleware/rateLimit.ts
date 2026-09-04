import rateLimit, { Store, ClientRateLimitInfo, Options } from 'express-rate-limit';
import mongoose, { Schema } from 'mongoose';

// ── Persistent Mongo-backed rate-limit store ───────────────────────────────
//
// express-rate-limit defaults to an in-memory store that resets on every
// process restart — making limits trivially bypassable by restarting a
// container. This store persists counts in MongoDB, reusing the app's
// existing Mongoose connection (no extra pool opened).
//
// The collection has a TTL index so MongoDB automatically removes expired
// windows without any cron job.

interface IRateRecord {
  _id: string;
  hits: number;
  expiresAt: Date;
}

const RateRecordSchema = new Schema<IRateRecord>(
  {
    _id: { type: String, required: true },
    hits: { type: Number, default: 1 },
    expiresAt: { type: Date, required: true },
  },
  { _id: false, timestamps: false }
);

// TTL index — MongoDB purges documents automatically when `expiresAt` passes.
RateRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Guard against "Cannot overwrite model" errors when Jest re-imports the module.
const RateRecord =
  (mongoose.models['__RateRecord'] as mongoose.Model<IRateRecord>) ??
  mongoose.model<IRateRecord>('__RateRecord', RateRecordSchema, 'rateLimitRecords');

/**
 * Implements the express-rate-limit v7 Store interface backed by MongoDB.
 * Mongoose buffers all operations until the connection is ready, so this is
 * safe to instantiate before `connectDB()` is called.
 *
 * @param windowMs - The rate limit window in milliseconds.
 * @param prefix   - Unique namespace prefix so each rate limiter stores its
 *                   counts under separate keys (avoids cross-limiter bleed).
 */
class MongoRateLimitStore implements Store {
  private readonly windowMs: number;
  private readonly keyPrefix: string;

  constructor(windowMs: number, keyPrefix: string) {
    this.windowMs = windowMs;
    this.keyPrefix = keyPrefix;
  }

  // Called by express-rate-limit to let the store know the window duration.
  init(options: Options): void {
    // windowMs is already captured in the constructor; nothing extra needed.
    void options;
  }

  private makeKey(key: string): string {
    return `${this.keyPrefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const expiresAt = new Date(Date.now() + this.windowMs);
    const record = await RateRecord.findOneAndUpdate(
      { _id: this.makeKey(key) },
      {
        $inc: { hits: 1 },
        // Only set expiresAt on first insert — keeps the window fixed.
        $setOnInsert: { expiresAt },
      },
      { upsert: true, new: true },
    );
    return {
      totalHits: record!.hits,
      resetTime: record!.expiresAt,
    };
  }

  async decrement(key: string): Promise<void> {
    await RateRecord.updateOne({ _id: this.makeKey(key) }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await RateRecord.deleteOne({ _id: this.makeKey(key) });
  }

  async resetAll(): Promise<void> {
    // Only delete records belonging to this limiter's namespace.
    await RateRecord.deleteMany({ _id: { $regex: `^${this.keyPrefix}:` } });
  }
}

// ── Rate limiters ──────────────────────────────────────────────────────────

/**
 * Login attempts: strict, per-IP limit to slow down credential stuffing /
 * brute force against the two known accounts.
 */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
  // validate.singleCount: false — loginRateLimiter intentionally coexists with
  // apiRateLimiter on the same route; suppress the spurious double-count warning.
  validate: { singleCount: false },
  store: new MongoRateLimitStore(15 * 60 * 1000, 'login'),
});

/**
 * General API rate limit as a safety net against abusive polling/scripts.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  store: new MongoRateLimitStore(60 * 1000, 'api'),
});

/**
 * Tighter limit specifically on sending messages, independent of read
 * traffic.
 */
export const sendMessageRateLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You are sending messages too quickly.' },
  // validate.singleCount: false — sendMessageRateLimiter coexists with apiRateLimiter.
  validate: { singleCount: false },
  store: new MongoRateLimitStore(10 * 1000, 'send'),
});
