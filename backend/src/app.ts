import express, { Express, RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import mongoSanitize from 'express-mongo-sanitize';
import mongoose from 'mongoose';
import { env } from './config/env';

// Augment express-session inline so ts-node always sees it regardless of
// how it discovers ambient declaration files.
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    peerId?: string; // cached peer user ID — resolved once on first use, stored for the session lifetime
  }
}
import { apiRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import messagesRoutes from './routes/messages.routes';
import usersRoutes from './routes/users.routes';
import adminRoutes from './routes/admin.routes';

export function buildSessionMiddleware(): RequestHandler {
  return session({
    name: 'chat.sid',
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true, // sliding expiration on activity
    // Reuses the existing mongoose connection (call connectDB() before this)
    // rather than opening a second pool via a separate mongoUrl.
    store: MongoStore.create({
      client: mongoose.connection.getClient() as never,
      ttl: env.sessionTtlMs / 1000,
      touchAfter: 60, // seconds — avoid writing to the store on every request
    }),
    cookie: {
      httpOnly: true,
      secure: env.isProduction, // requires HTTPS in production
      sameSite: 'strict', // strongest CSRF mitigation — safe for a private 2-person app
      maxAge: env.sessionTtlMs,
    },
  });
}

export function createApp(sessionMiddleware: RequestHandler): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // needed for secure cookies behind a proxy (e.g. Vercel/NGINX)

  app.use(helmet());
  app.use(
    cors({
      origin: env.clientOrigin,
      credentials: true,
    })
  );

  // Compress all responses — meaningful for JSON payloads and especially
  // for the CSV export which can be hundreds of megabytes uncompressed.
  app.use(compression());

  // HTTP request logger — dev only; production logging belongs in the
  // infra layer (Vercel/Nginx access logs).
  if (!env.isProduction) {
    app.use(morgan('dev'));
  }

  app.use(express.json({ limit: '32kb' })); // small cap; messages are short text
  app.use(cookieParser());
  app.use(sessionMiddleware);
  app.use(mongoSanitize()); // strips $/. operators from user input, blocking NoSQL injection

  app.use('/api', apiRateLimiter);
  app.use('/api/auth', authRoutes);
  app.use('/api/messages', messagesRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/admin', adminRoutes);

  app.get('/api/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
