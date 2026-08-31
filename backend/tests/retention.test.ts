import { Message } from '../src/models/Message';
import { Meta, MESSAGE_COUNTER_KEY } from '../src/models/Meta';
import { recordMessageAndMaybeTrim, resyncMessageCounter } from '../src/services/retention';
import { Types } from 'mongoose';

// Use a tiny cap to exercise the trim logic without inserting 5M docs.
const SMALL_CAP = 10;

async function insertRawMessages(count: number): Promise<void> {
  const fakeId1 = new Types.ObjectId();
  const fakeId2 = new Types.ObjectId();
  const docs = Array.from({ length: count }, (_, i) => ({
    senderId: fakeId1,
    receiverId: fakeId2,
    content: `msg ${i}`,
    createdAt: new Date(Date.now() - (count - i) * 1000),
  }));
  await Message.insertMany(docs);
}

describe('Message retention', () => {
  beforeEach(async () => {
    await Meta.deleteMany({});
    await Message.deleteMany({});
    await Meta.create({ key: MESSAGE_COUNTER_KEY, messageCount: 0 });
  });

  it('resyncMessageCounter returns the real document count', async () => {
    await insertRawMessages(7);
    const count = await resyncMessageCounter();
    expect(count).toBe(7);

    const meta = await Meta.findOne({ key: MESSAGE_COUNTER_KEY });
    expect(meta?.messageCount).toBe(7);
  });

  it('increments the counter on each call to recordMessageAndMaybeTrim', async () => {
    // Set check interval to 1 so every call triggers a check.
    const originalInterval = process.env.RETENTION_CHECK_INTERVAL;
    process.env.RETENTION_CHECK_INTERVAL = '1';

    // Re-import with patched env — use a fresh counter starting from 0
    await recordMessageAndMaybeTrim();
    await recordMessageAndMaybeTrim();
    await recordMessageAndMaybeTrim();

    const meta = await Meta.findOne({ key: MESSAGE_COUNTER_KEY });
    expect(meta?.messageCount).toBe(3);

    process.env.RETENTION_CHECK_INTERVAL = originalInterval;
  });

  it('trims oldest messages when the cap is exceeded', async () => {
    // Pre-populate with SMALL_CAP + 3 messages and set the counter.
    const extra = 3;
    await insertRawMessages(SMALL_CAP + extra);
    await Meta.updateOne(
      { key: MESSAGE_COUNTER_KEY },
      { $set: { messageCount: SMALL_CAP + extra } }
    );

    const originalMax = process.env.MAX_MESSAGES;
    const originalInterval = process.env.RETENTION_CHECK_INTERVAL;
    const originalBatch = process.env.RETENTION_BATCH_SIZE;

    process.env.MAX_MESSAGES = String(SMALL_CAP);
    process.env.RETENTION_CHECK_INTERVAL = '1';
    process.env.RETENTION_BATCH_SIZE = '500';

    // Trigger a trim
    await recordMessageAndMaybeTrim();

    const remaining = await Message.countDocuments();
    // Should be at most SMALL_CAP (may be one extra due to the +1 from the trigger call)
    expect(remaining).toBeLessThanOrEqual(SMALL_CAP + 1);

    process.env.MAX_MESSAGES = originalMax;
    process.env.RETENTION_CHECK_INTERVAL = originalInterval;
    process.env.RETENTION_BATCH_SIZE = originalBatch;
  });

  it('does not delete messages when under the cap', async () => {
    await insertRawMessages(5);
    await Meta.updateOne({ key: MESSAGE_COUNTER_KEY }, { $set: { messageCount: 5 } });

    const originalInterval = process.env.RETENTION_CHECK_INTERVAL;
    process.env.RETENTION_CHECK_INTERVAL = '1';
    process.env.MAX_MESSAGES = '10';

    await recordMessageAndMaybeTrim();

    const count = await Message.countDocuments();
    expect(count).toBe(5);

    process.env.RETENTION_CHECK_INTERVAL = originalInterval;
    process.env.MAX_MESSAGES = '5000000';
  });
});
