import express, { RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from '../src/config/env';
import { apiRateLimiter } from '../src/middleware/rateLimit';
import { errorHandler, notFoundHandler } from '../src/middleware/errorHandler';
import authRoutes from '../src/routes/auth.routes';
import messagesRoutes from '../src/routes/messages.routes';
import { User } from '../src/models/User';
import { hashPassword } from '../src/utils/password';
import { Meta, MESSAGE_COUNTER_KEY } from '../src/models/Meta';
import supertest from 'supertest';

/** Build an Express app backed by the real in-memory MongoDB.
 *  Uses a simple MemoryStore for sessions (no MongoStore dep in tests). */
export function buildTestApp() {
  const sessionMiddleware: RequestHandler = session({
    name: 'chat.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, sameSite: 'lax' },
  });

  const app = express();
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use(mongoSanitize());

  app.use('/api', apiRateLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messagesRoutes);
  app.get('/api/health', (_req, res) => res.status(200).json({ status: 'ok' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

/** Create the two authorized users in the in-memory DB.  Returns their plain passwords. */
export async function seedTestUsers() {
  const u1 = await User.create({
    username: env.users.user1.name,
    email: env.users.user1.email,
    passwordHash: await hashPassword(env.users.user1.password),
  });
  const u2 = await User.create({
    username: env.users.user2.name,
    email: env.users.user2.email,
    passwordHash: await hashPassword(env.users.user2.password),
  });
  await Meta.create({ key: MESSAGE_COUNTER_KEY, messageCount: 0 });
  return { u1, u2 };
}

/** Log in as a user and return an agent that carries the session cookie + CSRF token. */
export async function loginAs(
  agent: ReturnType<typeof supertest.agent>,
  email: string,
  password: string
): Promise<string> {
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.csrfToken as string;
}
