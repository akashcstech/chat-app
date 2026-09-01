import dns from 'dns';
import mongoose from 'mongoose';
import { env } from '../config/env';

// The system DNS resolver (127.0.0.1) may not resolve MongoDB Atlas SRV records.
// Override to use reliable public resolvers before any network activity.
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

let connected = false;

export async function connectDB(): Promise<typeof mongoose> {
  if (connected) return mongoose;

  mongoose.set('strictQuery', true);

  await mongoose.connect(env.databaseUrl, {
    // Connection pooling — keep this bounded so a single instance can't
    // exhaust Atlas connection limits.
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10_000,
  });

  connected = true;

  mongoose.connection.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[mongodb] connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    connected = false;
    // eslint-disable-next-line no-console
    console.warn('[mongodb] disconnected');
  });

  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  if (!connected) return;
  await mongoose.disconnect();
  connected = false;
}
