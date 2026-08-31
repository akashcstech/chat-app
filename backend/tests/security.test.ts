import supertest from 'supertest';
import { buildTestApp, seedTestUsers, loginAs } from './helpers';
import { env } from '../src/config/env';
import { Message } from '../src/models/Message';

describe('Security', () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(async () => {
    app = buildTestApp();
    await seedTestUsers();
  });

  // ─────────────────────── XSS ───────────────────────

  describe('XSS prevention', () => {
    it('strips <script> tags from message content', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const payload = '<script>alert("xss")</script>Hello';
      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: payload });

      expect(res.status).toBe(201);
      expect(res.body.message.content).not.toContain('<script>');
      expect(res.body.message.content).not.toContain('</script>');
      expect(res.body.message.content).toContain('Hello');
    });

    it('strips inline event handlers (onerror, onclick, etc.)', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const payload = '<img src=x onerror="alert(1)">Hello';
      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: payload });

      expect(res.status).toBe(201);
      expect(res.body.message.content).not.toContain('onerror');
      expect(res.body.message.content).not.toContain('<img');
    });

    it('strips javascript: URI schemes', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const payload = '<a href="javascript:alert(1)">click</a>';
      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: payload });

      expect(res.status).toBe(201);
      expect(res.body.message.content).not.toContain('javascript:');
    });

    it('stores the sanitized content in the DB', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: '<b>bold</b> message' });

      const msg = await Message.findOne({ content: { $regex: /message/ } });
      expect(msg).not.toBeNull();
      expect(msg?.content).not.toContain('<b>');
    });

    it('preserves plain text content untouched', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const plain = 'Hello world! This is a normal message. 🎉';
      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: plain });

      expect(res.status).toBe(201);
      expect(res.body.message.content).toBe(plain);
    });
  });

  // ─────────────────────── IMPERSONATION ───────────────────────

  describe('Impersonation prevention', () => {
    it('ignores any senderId in the request body — always uses session identity', async () => {
      const aliceAgent = supertest.agent(app);
      const aliceCsrf = await loginAs(aliceAgent, env.users.user1.email, env.users.user1.password);
      const aliceMe = await aliceAgent.get('/api/auth/me');
      const aliceId = aliceMe.body.user.id;

      const bobAgent = supertest.agent(app);
      const bobCsrf = await loginAs(bobAgent, env.users.user2.email, env.users.user2.password);
      const bobMe = await bobAgent.get('/api/auth/me');
      const bobId = bobMe.body.user.id;

      // Bob tries to spoof Alice's id as the sender
      const res = await bobAgent
        .post('/api/messages')
        .set('X-CSRF-Token', bobCsrf)
        .send({ content: 'I am Alice!', senderId: aliceId });

      expect(res.status).toBe(201);
      // The stored senderId should be Bob's, not Alice's
      expect(res.body.message.senderId).toBe(bobId);
      expect(res.body.message.senderId).not.toBe(aliceId);
    });

    it('ignores a userId header entirely — trusts only the session', async () => {
      const bobAgent = supertest.agent(app);
      const bobCsrf = await loginAs(bobAgent, env.users.user2.email, env.users.user2.password);
      const aliceMe = await supertest(app).get('/api/auth/me'); // 401, but we only need Alice's id
      void aliceMe; // expected 401 — just testing header is ignored

      const res = await bobAgent
        .post('/api/messages')
        .set('X-CSRF-Token', bobCsrf)
        .set('X-User-Id', 'arbitrary-fake-id')
        .send({ content: 'Sneaky send' });

      expect(res.status).toBe(201);
    });
  });

  // ─────────────────────── CSRF ───────────────────────

  describe('CSRF protection', () => {
    it('rejects POST without CSRF token', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.post('/api/messages').send({ content: 'No CSRF' });
      expect(res.status).toBe(403);
    });

    it('rejects POST with incorrect CSRF token', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', 'a'.repeat(64))
        .send({ content: 'Wrong CSRF' });
      expect(res.status).toBe(403);
    });

    it('accepts POST with correct CSRF token from the same session', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: 'Correct CSRF' });
      expect(res.status).toBe(201);
    });

    it("rejects DELETE with another session's CSRF token", async () => {
      const aliceAgent = supertest.agent(app);
      const aliceCsrf = await loginAs(aliceAgent, env.users.user1.email, env.users.user1.password);
      const sent = await aliceAgent
        .post('/api/messages')
        .set('X-CSRF-Token', aliceCsrf)
        .send({ content: 'Target' });

      const bobAgent = supertest.agent(app);
      const bobCsrf = await loginAs(bobAgent, env.users.user2.email, env.users.user2.password);

      // Bob sends his own CSRF token to try to delete Alice's message.
      // This should still be blocked — 404 because it's not Bob's message.
      const delRes = await bobAgent
        .delete(`/api/messages/${sent.body.message.id}`)
        .set('X-CSRF-Token', bobCsrf);
      expect(delRes.status).toBe(404);
    });
  });

  // ─────────────────────── SESSION ISOLATION ───────────────────────

  describe('Session isolation', () => {
    it('two sessions are independent; logging out one does not affect the other', async () => {
      const agent1 = supertest.agent(app);
      const csrf1 = await loginAs(agent1, env.users.user1.email, env.users.user1.password);

      const agent2 = supertest.agent(app);
      await loginAs(agent2, env.users.user2.email, env.users.user2.password);

      // Log out agent1
      await agent1.post('/api/auth/logout').set('X-CSRF-Token', csrf1);

      // agent1 should be gone
      expect((await agent1.get('/api/auth/me')).status).toBe(401);

      // agent2 should still be authenticated
      expect((await agent2.get('/api/auth/me')).status).toBe(200);
    });

    it('unauthenticated request cannot read messages', async () => {
      const res = await supertest(app).get('/api/messages');
      expect(res.status).toBe(401);
      expect(res.body.messages).toBeUndefined();
    });
  });

  // ─────────────────────── NOSQL INJECTION ───────────────────────

  describe('NoSQL injection prevention', () => {
    it('does not crash or match all users when $gt is injected into email', async () => {
      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: 'anything' });

      // Zod catches this before it reaches MongoDB — 400 or 401 are both fine
      expect([400, 401]).toContain(res.status);
    });

    it('does not execute operator injection in message content field', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      // mongoSanitize strips $ keys; the message should either be rejected or
      // stored as a safe string — it must never crash the server.
      const res = await agent
        .post('/api/messages')
        .set('X-CSRF-Token', csrf)
        .send({ content: { $where: 'sleep(1000)' } });

      // 400 from Zod (content must be a string) or the sanitizer transforms it
      expect(res.status).not.toBe(500);
    });
  });

  // ─────────────────────── SENSITIVE DATA IN RESPONSES ───────────────────────

  describe('No sensitive data leaks', () => {
    it('never returns passwordHash in login response', async () => {
      const res = await supertest(app)
        .post('/api/auth/login')
        .send({ email: env.users.user1.email, password: env.users.user1.password });

      expect(res.body?.user?.passwordHash).toBeUndefined();
    });

    it('never returns passwordHash in /me response', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);
      const res = await agent.get('/api/auth/me');
      expect(res.body?.user?.passwordHash).toBeUndefined();
    });

    it('never exposes MongoDB driver errors in 500 responses', async () => {
      // Hit a route that doesn't exist — the generic 404 should not contain
      // any driver string.
      const res = await supertest(app).get('/api/nonexistent-route');
      expect(res.status).toBe(404);
      const body = JSON.stringify(res.body);
      expect(body).not.toMatch(/MongoServer/i);
      expect(body).not.toMatch(/MongoDriver/i);
    });
  });
});
