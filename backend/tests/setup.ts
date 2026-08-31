process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mongodb://127.0.0.1:27017/unused-placeholder';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production-use-1234567890';
process.env.CLIENT_ORIGIN = 'http://localhost:3000';
process.env.RETENTION_CHECK_INTERVAL = '1';
process.env.MAX_MESSAGES = '5000000';
process.env.RETENTION_BATCH_SIZE = '500';

process.env.USER1_EMAIL = 'alice@example.com';
process.env.USER1_PASSWORD = 'alice-correct-horse-battery';
process.env.USER1_NAME = 'Alice';

process.env.USER2_EMAIL = 'bob@example.com';
process.env.USER2_PASSWORD = 'bob-correct-horse-battery';
process.env.USER2_NAME = 'Bob';

/* eslint-disable @typescript-eslint/no-var-requires */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}, 60_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});
