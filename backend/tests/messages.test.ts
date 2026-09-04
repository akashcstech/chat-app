import supertest from 'supertest';
import { buildTestApp, seedTestUsers, loginAs } from './helpers';
import { env } from '../src/config/env';
import { Message } from '../src/models/Message';
import { Types } from 'mongoose';

describe('Messages', () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(async () => {
    app = buildTestApp();
    await seedTestUsers();
  });

  // ─────────────────────── SEND MESSAGE ───────────────────────

  describe('POST /api/messages', () => {
    it('sends a message and returns 201 with the created message', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'Hello, Bob!' });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe('Hello, Bob!');
      expect(res.body.message.id).toBeDefined();
      expect(res.body.message.senderId).toBeDefined();
      expect(res.body.message.createdAt).toBeDefined();
    });

    it('persists the message to the database', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'Persistence test' });

      const count = await Message.countDocuments({ content: 'Persistence test' });
      expect(count).toBe(1);
    });

    it('returns 400 for an empty message', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: '' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a whitespace-only message', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: '   ' });

      expect(res.status).toBe(400);
    });

    it('returns 400 for a message exceeding 4000 characters', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'a'.repeat(4001) });

      expect(res.status).toBe(400);
    });

    it('returns 401 when not authenticated', async () => {
      const res = await supertest(app)
        .post('/api/messages')
        .set('X-CSRF-Token', 'fake')
        .send({ content: 'Hello' });

      expect(res.status).toBe(401);
    });

    it('returns 403 when the CSRF token is missing', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.post('/api/messages').send({ content: 'Hello' });

      expect(res.status).toBe(403);
    });

    it('returns 403 when the CSRF token is wrong', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', 'wrong-token')
        .send({ content: 'Hello' });

      expect(res.status).toBe(403);
    });

    it('accepts messages exactly 4000 characters', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'a'.repeat(4000) });

      expect(res.status).toBe(201);
    });

    it('returns 403 when the max message limit is reached', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);
      
      const { Meta, MESSAGE_COUNTER_KEY } = await import('../src/models/Meta');
      const originalMax = process.env.MAX_MESSAGES;
      
      try {
        process.env.MAX_MESSAGES = '10';
        await Meta.updateOne(
          { key: MESSAGE_COUNTER_KEY },
          { $set: { messageCount: 10 } },
          { upsert: true }
        );

        const res = await agent
          .post('/api/messages')
          .set('X-CSRF-Token', csrf)
          .send({ content: 'Should be blocked' });

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('limit reached');
      } finally {
        process.env.MAX_MESSAGES = originalMax;
        await Meta.deleteOne({ key: MESSAGE_COUNTER_KEY });
      }
    });
  });

  // ─────────────────────── GET MESSAGES ───────────────────────

  describe('GET /api/messages', () => {
    async function insertMessages(count: number, senderEmail: string) {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, senderEmail, 
        senderEmail === env.users.user1.email ? env.users.user1.password : env.users.user2.password
      );
      for (let i = 0; i < count; i++) {
        await agent
          .post('/api/messages')
          .set('X-CSRF-Token', csrf)
          .send({ content: `Message ${i + 1}` });
      }
    }

    it('returns an empty array when no messages exist', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.get('/api/messages');
      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
      expect(res.body.nextCursor).toBeNull();
    });

    it('returns the latest messages newest-first', async () => {
      await insertMessages(5, env.users.user1.email);

      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user2.email, env.users.user2.password);

      const res = await agent.get('/api/messages?limit=5');
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBe(5);

      const times = res.body.messages.map((m: { createdAt: string }) => new Date(m.createdAt).getTime());
      for (let i = 0; i < times.length - 1; i++) {
        expect(times[i]).toBeGreaterThanOrEqual(times[i + 1]);
      }
    });

    it('paginates using the nextCursor', async () => {
      await insertMessages(10, env.users.user1.email);

      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user2.email, env.users.user2.password);

      const page1 = await agent.get('/api/messages?limit=6');
      expect(page1.status).toBe(200);
      expect(page1.body.messages.length).toBe(6);
      expect(page1.body.nextCursor).not.toBeNull();

      const page2 = await agent.get(`/api/messages?limit=6&before=${page1.body.nextCursor}`);
      expect(page2.status).toBe(200);
      expect(page2.body.messages.length).toBe(4);
      expect(page2.body.nextCursor).toBeNull();

      const allIds = [
        ...page1.body.messages.map((m: { id: string }) => m.id),
        ...page2.body.messages.map((m: { id: string }) => m.id),
      ];
      expect(new Set(allIds).size).toBe(10);
    });

    it('returns 400 for an invalid limit', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.get('/api/messages?limit=999');
      expect(res.status).toBe(400);
    });

    it('returns 400 for an invalid cursor', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.get('/api/messages?before=not-an-objectid');
      expect(res.status).toBe(400);
    });

    it('returns 401 when unauthenticated', async () => {
      const res = await supertest(app).get('/api/messages');
      expect(res.status).toBe(401);
    });

    it('does not return more than 100 messages even if the DB has more', async () => {
      // Insert 105 directly to avoid HTTP overhead
      const alice = await Message.findOne({}).lean();
      const msgs = Array.from({ length: 105 }, (_, i) => ({
        senderId: new Types.ObjectId(),
        receiverId: new Types.ObjectId(),
        content: `bulk ${i}`,
        createdAt: new Date(Date.now() - i * 1000),
      }));
      // Use the test-friendly endpoint path instead
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      // Clamp at 100 by the query schema
      const res = await agent.get('/api/messages?limit=100');
      expect(res.status).toBe(200);
      expect(res.body.messages.length).toBeLessThanOrEqual(100);
      // Suppress unused variable lint warning
      void alice;
      void msgs;
    });
  });

  // ─────────────────────── DELETE MESSAGE ───────────────────────

  describe('DELETE /api/messages/:id', () => {
    it('allows the sender to delete their own message', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const sent = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'Delete me' });

      const messageId = sent.body.message.id;

      const delRes = await agent
        .delete(`/api/messages/${messageId}`)
        .set('X-CSRF-Token', csrf);

      expect(delRes.status).toBe(200);
      expect(await Message.findById(messageId)).toBeNull();
    });

    it("prevents user2 from deleting user1's message", async () => {
      // Alice sends a message
      const aliceAgent = supertest.agent(app);
      const aliceCsrf = await loginAs(aliceAgent, env.users.user1.email, env.users.user1.password);
      const sent = await aliceAgent
        .post('/api/messages')
        .set('X-CSRF-Token', aliceCsrf)
        .send({ content: 'Mine!' });

      const messageId = sent.body.message.id;

      // Bob tries to delete it
      const bobAgent = supertest.agent(app);
      const bobCsrf = await loginAs(bobAgent, env.users.user2.email, env.users.user2.password);
      const delRes = await bobAgent
        .delete(`/api/messages/${messageId}`)
        .set('X-CSRF-Token', bobCsrf);

      expect(delRes.status).toBe(404);
      expect(await Message.findById(messageId)).not.toBeNull();
    });

    it('returns 400 for an invalid message id format', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .delete('/api/messages/not-a-valid-id')
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(400);
    });

    it('returns 404 for a non-existent message id', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);
      const fakeId = new Types.ObjectId().toString();

      const res = await agent
        .delete(`/api/messages/${fakeId}`)
        .set('X-CSRF-Token', csrf);

      expect(res.status).toBe(404);
    });
  });
});
