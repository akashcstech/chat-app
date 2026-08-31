import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { RequestHandler } from 'express';
import { env } from '../config/env';
import { chatEvents, MESSAGE_CREATED } from './events';
import { IMessage } from '../models/Message';

interface AuthedSocket extends Socket {
  data: {
    userId?: string;
  };
}

/**
 * Wraps an express-session middleware so it can run inside the socket.io
 * handshake, letting us authenticate sockets off the SAME HttpOnly
 * session cookie used by the REST API — no separate token to manage.
 */
function wrapMiddleware(middleware: RequestHandler) {
  return (socket: Socket, next: (err?: Error) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    middleware(socket.request as any, {} as any, next as any);
  };
}

export function initSocketServer(httpServer: HttpServer, sessionMiddleware: RequestHandler): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.clientOrigin,
      credentials: true,
    },
  });

  io.use(wrapMiddleware(sessionMiddleware));

  io.use((socket, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const session = (socket.request as any).session;
    const userId: string | undefined = session?.userId;
    if (!userId) {
      next(new Error('Unauthorized'));
      return;
    }
    (socket as AuthedSocket).data.userId = userId;
    next();
  });

  io.on('connection', (socket: AuthedSocket) => {
    const userId = socket.data.userId as string;
    // Each authenticated user joins a personal room keyed by their id, so
    // we can target message delivery precisely.
    socket.join(`user:${userId}`);

    socket.on('disconnect', () => {
      // no-op; room membership is cleaned up automatically
    });
  });

  chatEvents.on(MESSAGE_CREATED, (message: IMessage) => {
    const payload = {
      id: message._id.toString(),
      senderId: message.senderId.toString(),
      receiverId: message.receiverId.toString(),
      content: message.content,
      createdAt: message.createdAt,
    };
    io.to(`user:${payload.senderId}`).to(`user:${payload.receiverId}`).emit('message:new', payload);
  });

  return io;
}
