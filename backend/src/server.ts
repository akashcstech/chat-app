import http from 'http';
import { createApp, buildSessionMiddleware } from './app';
import { connectDB } from './db/connect';
import { seedUsers } from './db/seed';
import { initSocketServer } from './websocket/socket';
import { env } from './config/env';

async function main(): Promise<void> {
  await connectDB();
  await seedUsers();

  // Built once and shared by both the REST API and Socket.IO, so socket
  // handshakes authenticate off the identical cookie/session store.
  const sessionMiddleware = buildSessionMiddleware();

  const app = createApp(sessionMiddleware);
  const httpServer = http.createServer(app);

  initSocketServer(httpServer, sessionMiddleware);

  httpServer.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[server] listening on port ${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`[server] received ${signal}, shutting down...`);
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[server] fatal startup error:', err);
  process.exit(1);
});
