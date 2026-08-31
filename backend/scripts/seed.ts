/* eslint-disable no-console */
import { connectDB, disconnectDB } from '../src/db/connect';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { resyncMessageCounter } from '../src/services/retention';
import { env } from '../src/config/env';

async function upsertUser(email: string, password: string, username: string): Promise<void> {
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] user already exists, skipping: ${email}`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await User.create({ email, username, passwordHash });
  console.log(`[seed] created user: ${email}`);
}

async function main(): Promise<void> {
  await connectDB();

  await upsertUser(env.users.user1.email, env.users.user1.password, env.users.user1.name);
  await upsertUser(env.users.user2.email, env.users.user2.password, env.users.user2.name);

  const totalUsers = await User.countDocuments();
  if (totalUsers !== 2) {
    console.warn(
      `[seed] WARNING: expected exactly 2 users, found ${totalUsers}. ` +
        `This application is designed for exactly two authorized users.`
    );
  }

  const count = await resyncMessageCounter();
  console.log(`[seed] message counter synced: ${count}`);

  console.log('[seed] done.');
  await disconnectDB();
  process.exit(0);
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
