# Backend Audit — Private Chat App

---

## 1. Feature Inventory (What We Have)

### Auth (`/api/auth`)
| Route | What it does |
|---|---|
| `POST /login` | Validates email+password via Argon2id, creates server-side session, returns CSRF token |
| `POST /logout` | Destroys session, clears cookie |
| `GET /me` | Returns current user + fresh CSRF token from session |

### Messages (`/api/messages`)
| Route | What it does |
|---|---|
| `GET /?limit=N&before=<id>` | Cursor-based pagination, newest-first, max 100 per page |
| `POST /` | Sanitizes + validates content, creates message, fires Socket.IO event |
| `DELETE /:id` | Deletes own messages only (sender check), decrements counter |

### Users (`/api/users`)
| Route | What it does |
|---|---|
| `GET /peer` | Returns the other user's public profile for chat header |

### Admin (`/api/admin`)
| Route | What it does |
|---|---|
| `GET /stats` | Returns `{messageCount, cap}` from Meta counter |
| `POST /export-and-reset` | User 2 only — streams CSV of all messages, then wipes DB + resets counter |

### Health
| Route | What it does |
|---|---|
| `GET /api/health` | Returns `{status: "ok"}` — no auth required |

### WebSocket (`socket.io`)
- Session-cookie authenticated (same session as REST API)
- Each user joins personal room `user:<id>`
- Emits `message:new` to both sender + receiver on message create

### Middleware Stack (in order)
- `helmet` — security HTTP headers
- `cors` — origin whitelist from env
- `express.json` — 32kb body limit
- `cookie-parser`
- `express-session` + MongoStore
- `express-mongo-sanitize` — strips `$` operators
- `apiRateLimiter` — 120 req/min per IP
- `loginRateLimiter` — 10 attempts / 15 min (skips successes)
- `sendMessageRateLimiter` — 20 messages / 10 sec
- `requireAuth` — session guard
- `requireCsrfToken` — double-submit cookie CSRF

### Services & Utils
- `retention.ts` — counter-based trim (never `countDocuments()` on hot path)
- `password.ts` — Argon2id hash + verify
- `sanitize.ts` — `sanitize-html` strips all tags, `sanitizeSingleLine` strips newlines
- `validation.ts` — Zod schemas for login, send message, get messages query, objectId
- `users.ts` — `getOtherUser()` resolves the peer by exclusion
- `seed.ts` — upserts both users from env, resyncs counter

### Tests (Jest + mongodb-memory-server)
- `auth.test.ts` — 10 tests (login, logout, me, protection)
- `security.test.ts` — 16 tests (XSS, CSRF, impersonation, NoSQL injection, data leaks)
- `messages.test.ts` — messages CRUD
- `retention.test.ts` — 4 tests (cap, trim, counter sync)

---

## 2. Dead Code / Useless Things

| Item | Location | Why Dead |
|---|---|---|
| **Empty scaffold dir** | `src/{config,db,...}` | Empty junk folder from a broken scaffold — safe to delete |
| **`sanitizeSingleLine()`** | `src/utils/sanitize.ts:18` | Defined but **never called anywhere** in the codebase |
| **`disconnectDB()`** is only called from seed.ts | `src/db/connect.ts:40` | Fine for seed, but the server never calls it — not dead but worth noting |
| **`makeHttpServer()`** | `tests/helpers.ts:77` | Helper that creates an HTTP server but is **never used** in any test file |
| **`src/types/express-session.d.ts`** | Entire file | We moved the augmentation inline to `app.ts` — this file is now completely redundant |
| **`cookie-parser`** import in `tests/helpers.ts` | Line 5 | Session cookies in tests use MemoryStore; `cookieParser` is registered but the test agent handles cookies natively via supertest — low impact but unnecessary |
| **`http` import** in `tests/helpers.ts:1` | Line 1 | Only used by `makeHttpServer()` which is itself never called |

---

## 3. Performance Issues

| Issue | Severity | Where |
|---|---|---|
| **`getOtherUser()` runs on every message send AND every message fetch** | Medium | `src/services/users.ts` — does a DB query every time instead of caching |
| **`exportAndReset` loads ALL messages into memory** | Medium-High | `admin.controller.ts` — `Message.find({})` with `.lean()` is fine for 500k but will spike RAM; should stream instead |
| **`populate()` in export — 2 extra DB lookups per call** | Low-Medium | `admin.controller.ts` — populates `senderId` + `receiverId` for every message, 2 extra round trips |
| **No compression middleware** | Low | Responses (especially CSV export) are uncompressed — `compression` package would help |
| **`retentionCheckInterval` default is 50** | Low | Could be higher (e.g. 100) to reduce overhead on the hot path |
| **MongoStore `touchAfter: 60`** | Good | Already set — this is correct and prevents session write on every request |
| **Connection pool min=2, max=20** | Good | Appropriate for Atlas free tier |

---

## 4. Security Gaps / Improvements

| Issue | Severity | Detail |
|---|---|---|
| **No `SameSite=Strict` on cookie** | Low | Currently `sameSite: 'lax'` — `strict` would be safer for a 2-person private app |
| **CSRF token never rotated after actions** | Low | Generated once at login, lives for the session lifetime — acceptable for MVP |
| **No request body size limit on admin export** | None | Export is a GET-like POST with no body, fine |
| **Rate limiter uses in-memory store** | Medium | `express-rate-limit` defaults to in-memory — resets on process restart; for production should use `rate-limit-redis` or similar |
| **`SESSION_TTL_MS` = 7 days default** | Low | Long session lifetime; consider reducing for a private app |
| **No Helmet `contentSecurityPolicy` tuning** | Low | Default Helmet CSP may block Socket.IO's polling fallback in some browsers |

---

## 5. Prioritized Action Plan

> ✅ = Quick win (< 30 min) | ⚙️ = Medium effort | 🏗️ = Larger refactor

### Round 1 — Dead Code Removal
- [ ] ✅ Delete the empty `src/{config,db,...}` phantom directory
- [ ] ✅ Remove `sanitizeSingleLine()` from `sanitize.ts` (unused)
- [ ] ✅ Delete `src/types/express-session.d.ts` (redundant)
- [ ] ✅ Remove `makeHttpServer()` + unused `http` import from `tests/helpers.ts`

### Round 2 — Performance
- [ ] ✅ Cache `getOtherUser()` result per session (store peer ID in session after first resolve)
- [ ] ⚙️ Replace `Message.find({})` in export with a cursor/stream to avoid full RAM spike
- [ ] ✅ Add `compression` middleware to `app.ts`
- [ ] ✅ Increase `RETENTION_CHECK_INTERVAL` default to 100

### Round 3 — Security Hardening
- [ ] ✅ Change `sameSite` to `'strict'` in session cookie config
- [ ] ✅ Switch rate limiter to persistent store (use `rate-limit-mongo` — already have the connection)

### Round 4 — Code Quality
- [ ] ✅ Fix the `retentionCheckInterval` env reading — it's read at module load time, not per-call (causes the test to mutate env and see stale values)
- [ ] ✅ Add `morgan` HTTP request logger for dev visibility
- [ ] ⚙️ Separate `populate()` in admin export into two targeted queries to avoid Mongoose population overhead

---

**Tell me which round to start with and I'll execute immediately.**
