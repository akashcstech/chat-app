import { Message } from '../src/models/Message';
import { Meta, MESSAGE_COUNTER_KEY } from '../src/models/Meta';
import { recordMessageCount, resyncMessageCounter } from '../src/services/retention';
import { Types } from 'mongoose';

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

describe('Message retention (counter only)', () => {
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

  it('increments the counter on each call to recordMessageCount', async () => {
    await recordMessageCount();
    await recordMessageCount();
    await recordMessageCount();

    const meta = await Meta.findOne({ key: MESSAGE_COUNTER_KEY });
    expect(meta?.messageCount).toBe(3);
  });

  it('does not delete messages even if the cap is exceeded', async () => {
    // Insert 15 messages
    await insertRawMessages(15);
    await Meta.updateOne({ key: MESSAGE_COUNTER_KEY }, { $set: { messageCount: 15 } });

    const originalMax = process.env.MAX_MESSAGES;
    process.env.MAX_MESSAGES = '10';

    await recordMessageCount();

    const count = await Message.countDocuments();
    expect(count).toBe(15); // Nothing was deleted

    process.env.MAX_MESSAGES = originalMax;
  });
});
