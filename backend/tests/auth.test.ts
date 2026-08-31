import supertest from 'supertest';
import { buildTestApp, seedTestUsers, loginAs } from './helpers';
import { env } from '../src/config/env';

describe('Authentication', () => {
  let app: ReturnType<typeof buildTestApp>;

  beforeEach(async () => {
    app = buildTestApp();
    await seedTestUsers();
  });

  // ────────────────────────────── LOGIN ──────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns 200 and a CSRF token on valid credentials', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: env.users.user1.email,
        password: env.users.user1.password,
      });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(env.users.user1.email);
      expect(typeof res.body.csrfToken).toBe('string');
      expect(res.body.csrfToken.length).toBeGreaterThan(16);
      // Ensure no hash leaks
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('sets an HttpOnly session cookie', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: env.users.user1.email,
        password: env.users.user1.password,
      });

      expect(res.status).toBe(200);
      const cookie = res.headers['set-cookie'];
      expect(cookie).toBeDefined();
      const cookieStr = Array.isArray(cookie) ? cookie.join(';') : cookie;
      expect(cookieStr.toLowerCase()).toContain('httponly');
    });

    it('returns 401 with a generic message on wrong password', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: env.users.user1.email,
        password: 'wrong-password',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('returns 401 with the same generic message for unknown email', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'whatever',
      });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('returns 400 for a malformed email', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: 'not-an-email',
        password: env.users.user1.password,
      });

      expect(res.status).toBe(400);
    });

    it('returns 400 when body is empty', async () => {
      const res = await supertest(app).post('/api/auth/login').send({});
      expect(res.status).toBe(400);
    });

    it('user2 can also log in independently', async () => {
      const res = await supertest(app).post('/api/auth/login').send({
        email: env.users.user2.email,
        password: env.users.user2.password,
      });
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(env.users.user2.email);
    });
  });

  // ────────────────────────────── LOGOUT ──────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('destroys the session and returns 200', async () => {
      const agent = supertest.agent(app);
      const csrf = await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const logoutRes = await agent
        .post('/api/auth/logout')
        .set('X-CSRF-Token', csrf);
      expect(logoutRes.status).toBe(200);

      // After logout, /api/auth/me should be 401
      const meRes = await agent.get('/api/auth/me');
      expect(meRes.status).toBe(401);
    });

    it('returns 401 when not logged in', async () => {
      const res = await supertest(app)
        .post('/api/auth/logout')
        .set('X-CSRF-Token', 'irrelevant');
      expect(res.status).toBe(401);
    });
  });

  // ────────────────────────────── ME ──────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns the authenticated user without exposing the hash', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);

      const res = await agent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(env.users.user1.email);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 for unauthenticated requests', async () => {
      const res = await supertest(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('a fresh CSRF token is included in the response', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);
      const res = await agent.get('/api/auth/me');
      expect(typeof res.body.csrfToken).toBe('string');
    });
  });

  // ────────────────────────────── PROTECTED ROUTES ──────────────────────────────

  describe('Protected route access', () => {
    it('blocks unauthenticated access to /api/messages', async () => {
      const res = await supertest(app).get('/api/messages');
      expect(res.status).toBe(401);
    });

    it('allows authenticated access to /api/messages', async () => {
      const agent = supertest.agent(app);
      await loginAs(agent, env.users.user1.email, env.users.user1.password);
      const res = await agent.get('/api/messages');
      expect(res.status).toBe(200);
    });
  });
});
