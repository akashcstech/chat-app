import { User } from '../models/User';
import { env } from '../config/env';
import { hashPassword, verifyPassword } from '../utils/password';

interface SeedUser {
  email: string;
  password: string;
  username: string;
}

/**
 * Upsert the two authorised users defined in the environment.
 * - If a user does not exist yet → create them.
 * - If a user exists but their password has changed → re-hash and update.
 * - If nothing changed → no-op (fast path).
 *
 * This runs every startup so credentials stay in sync with .env without
 * requiring a separate migration step.
 */
export async function seedUsers(): Promise<void> {
  const users: SeedUser[] = [
    { email: env.users.user1.email, password: env.users.user1.password, username: env.users.user1.name },
    { email: env.users.user2.email, password: env.users.user2.password, username: env.users.user2.name },
  ];

  for (const u of users) {
    const existing = await User.findOne({ email: u.email.toLowerCase() }).select('+passwordHash');

    if (!existing) {
      const passwordHash = await hashPassword(u.password);
      await User.create({ email: u.email.toLowerCase(), username: u.username, passwordHash });
      // eslint-disable-next-line no-console
      console.log(`[seed] created user: ${u.email}`);
      continue;
    }

    // Update username if it drifted.
    let dirty = false;
    if (existing.username !== u.username) {
      existing.username = u.username;
      dirty = true;
    }

    // Re-hash only if the plaintext password has changed.
    const passwordMatches = await verifyPassword(existing.passwordHash, u.password);
    if (!passwordMatches) {
      existing.passwordHash = await hashPassword(u.password);
      dirty = true;
      // eslint-disable-next-line no-console
      console.log(`[seed] updated password for: ${u.email}`);
    }

    if (dirty) await existing.save();
  }
}
