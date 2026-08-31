# Private Chat — Backend

A production-ready **Node.js / Express / TypeScript** backend for a secure, private 1-to-1 chat between exactly two authorized users.

---

## Table of Contents

1. [Architecture overview](#architecture-overview)
2. [Tech stack](#tech-stack)
3. [Prerequisites](#prerequisites)
4. [Local development setup](#local-development-setup)
5. [Environment variables reference](#environment-variables-reference)
6. [Seeding the database](#seeding-the-database)
7. [Running the server](#running-the-server)
8. [Running tests](#running-tests)
9. [API reference](#api-reference)
10. [Real-time (Socket.IO)](#real-time-socketio)
11. [Security design](#security-design)
12. [Message retention (5M cap)](#message-retention-5m-cap)
13. [Performance notes](#performance-notes)
14. [Production deployment](#production-deployment)
15. [Project structure](#project-structure)

---

## Architecture overview

```
HTTP Client / Next.js frontend
        │
        │  REST (cookie-session) + WebSocket (Socket.IO)
        ▼
┌─────────────────────────┐
│   Express Application   │
│  ┌───────────────────┐  │
│  │  Helmet / CORS    │  │  Security headers
│  │  Rate Limiter     │  │  Login: 10 req/15 min; API: 120 req/min
│  │  MongoSanitize    │  │  NoSQL injection prevention
│  │  Session (cookie) │  │  HttpOnly, SameSite=Lax
│  │  CSRF middleware  │  │  Double-submit token via header
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │  /api/auth        │  │  login · logout · me
│  │  /api/messages    │  │  GET (paginated) · POST · DELETE
│  └───────────────────┘  │
│  ┌───────────────────┐  │
│  │  Socket.IO        │  │  Authenticated via same session cookie
│  └───────────────────┘  │
└────────────┬────────────┘
             │  Mongoose (pooled)
             ▼
     MongoDB Atlas
   ┌──────────────────┐
   │  users           │
   │  messages        │  ← indexes: (sender,receiver,createdAt), createdAt
   │  metas           │  ← running message counter
   │  sessions        │  ← connect-mongo
   └──────────────────┘
```

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Language | TypeScript 5 |
| HTTP framework | Express 4 |
| WebSockets | Socket.IO 4 |
| Database | MongoDB (via Mongoose 8) |
| Sessions | express-session + connect-mongo |
| Password hashing | Argon2id |
| Validation | Zod |
| Sanitization | sanitize-html |
| Security headers | Helmet |
| Rate limiting | express-rate-limit |
| Tests | Jest + ts-jest + mongodb-memory-server |

---

## Prerequisites

- **Node.js 18+** (`node --version`)
- **npm 9+** (`npm --version`)
- A **MongoDB Atlas** cluster URI (free tier M0 is fine for the MVP) **or** a local `mongod` instance

---

## Local development setup

```bash
# 1. Clone / download the project
cd private-chat-backend

# 2. Install dependencies
npm install

# 3. Create your .env file from the template
cp .env.example .env
# Then open .env and fill in DATABASE_URL, SESSION_SECRET, and the user fields.

# 4. Seed the two authorized users
npm run seed

# 5. Start the development server (hot-reload)
npm run dev
```

The server starts on `http://localhost:4000` by default (override with `PORT=`).

---

## Environment variables reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` enables secure cookies + tighter checks |
| `PORT` | No | `4000` | TCP port the server listens on |
| `CLIENT_ORIGIN` | No | `http://localhost:3000` | Comma-separated list of allowed CORS origins |
| `DATABASE_URL` | **Yes** | — | MongoDB connection string |
| `SESSION_SECRET` | **Yes** | — | Secret used to sign the session cookie (min 32 chars in prod) |
| `SESSION_TTL_MS` | No | `604800000` (7 days) | Session lifetime in milliseconds |
| `MAX_MESSAGES` | No | `5000000` | Maximum retained messages (5 lakh default) |
| `RETENTION_BATCH_SIZE` | No | `500` | How many old messages to delete per cleanup pass |
| `RETENTION_CHECK_INTERVAL` | No | `50` | Run retention check every N inserts |
| `USER1_EMAIL` | **Yes** | — | Email for authorized user 1 |
| `USER1_PASSWORD` | **Yes** | — | Plain password for user 1 (hashed by seed script, never stored) |
| `USER1_NAME` | **Yes** | — | Display name for user 1 |
| `USER2_EMAIL` | **Yes** | — | Email for authorized user 2 |
| `USER2_PASSWORD` | **Yes** | — | Plain password for user 2 |
| `USER2_NAME` | **Yes** | — | Display name for user 2 |

---

## Seeding the database

```bash
npm run seed
```

The script:
1. Connects to MongoDB using `DATABASE_URL`
2. Creates user 1 and user 2 (reads credentials from `.env`)
3. Hashes passwords with **Argon2id** — plain passwords are never stored
4. Skips users that already exist (idempotent — safe to re-run)
5. Syncs the message counter
6. Exits cleanly

> **There is no public registration endpoint.** To change user credentials, update `.env` and re-run `npm run seed` after manually deleting the old user documents, or update the hash in the database directly using the seed script.

---

## Running the server

```bash
# Development (hot-reload via nodemon + ts-node)
npm run dev

# Production build
npm run build
npm start
```

### Health check

```
GET /api/health
→ 200 { "status": "ok" }
```

---

## Running tests

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch
```

Tests use **mongodb-memory-server** — no real database connection needed.

Test suites:

| File | What it covers |
|---|---|
| `tests/auth.test.ts` | Login, logout, session cookies, protected routes |
| `tests/messages.test.ts` | Send, receive, cursor pagination, validation, delete |
| `tests/security.test.ts` | XSS stripping, impersonation, CSRF, NoSQL injection, data leaks |
| `tests/retention.test.ts` | Message counter, trim-on-cap, no-delete-under-cap |

---

## API reference

All endpoints are prefixed with `/api`.  
State-changing endpoints (`POST`, `DELETE`) require the `X-CSRF-Token` header with the token returned by `/api/auth/login` or `/api/auth/me`.

---

### Auth

#### `POST /api/auth/login`

Login with email and password.

**Rate limited:** 10 attempts per 15 minutes per IP.

Request body:
```json
{
  "email": "alice@example.com",
  "password": "your-password"
}
```

Success `200`:
```json
{
  "user": { "id": "...", "username": "Alice", "email": "alice@example.com" },
  "csrfToken": "<64-char hex token>"
}
```

Also sets the `chat.sid` **HttpOnly session cookie**.

Errors: `400` (bad input) · `401` (invalid credentials) · `429` (rate limited)

---

#### `POST /api/auth/logout`

Destroys the current session.  
Requires: auth session + `X-CSRF-Token` header.

Success `200`:
```json
{ "ok": true }
```

---

#### `GET /api/auth/me`

Returns the current authenticated user.  
Requires: auth session.

Success `200`:
```json
{
  "user": { "id": "...", "username": "Alice", "email": "alice@example.com" },
  "csrfToken": "<token>"
}
```

Error: `401`

---

### Messages

#### `GET /api/messages?limit=50&before=<messageId>`

Fetch a page of messages (newest first).  
Requires: auth session.

| Parameter | Type | Default | Max | Description |
|---|---|---|---|---|
| `limit` | integer | `50` | `100` | Number of messages to return |
| `before` | ObjectId string | — | — | Return messages older than this id (cursor) |

Success `200`:
```json
{
  "messages": [
    {
      "id": "664abc...",
      "senderId": "664...",
      "receiverId": "664...",
      "content": "Hello!",
      "createdAt": "2024-05-01T10:00:00.000Z"
    }
  ],
  "nextCursor": "664abc..." // null if no more pages
}
```

**Pagination pattern** (client side):
```
Initial load:  GET /api/messages?limit=50
Scroll up:     GET /api/messages?limit=50&before=<nextCursor>
```

---

#### `POST /api/messages`

Send a message.  
Requires: auth session + `X-CSRF-Token` header.

Request body:
```json
{ "content": "Hello!" }
```

Success `201`:
```json
{
  "message": {
    "id": "664abc...",
    "senderId": "...",
    "receiverId": "...",
    "content": "Hello!",
    "createdAt": "..."
  }
}
```

Errors: `400` (empty / too long / bad body) · `401` · `403` (CSRF) · `429` (rate limited)

---

#### `DELETE /api/messages/:id`

Delete a message.  
Requires: auth session + `X-CSRF-Token` header.  
Only the **original sender** may delete a message.

Success `200`: `{ "ok": true }`  
Errors: `400` (invalid id) · `401` · `403` (CSRF) · `404` (not found or not yours)

---

## Real-time (Socket.IO)

The server exposes a Socket.IO endpoint on the same port as the REST API.

**Authentication:** The client must present the same `chat.sid` session cookie used for REST. No separate token is needed.

**Connection:**
```javascript
import { io } from "socket.io-client";

const socket = io("http://localhost:4000", { withCredentials: true });
```

**Receiving new messages:**
```javascript
socket.on("message:new", (message) => {
  // { id, senderId, receiverId, content, createdAt }
  appendToChat(message);
});
```

When a user sends a message via `POST /api/messages`, both the sender and receiver receive a `message:new` event in real time — no polling required.

---

## Security design

| Concern | Mechanism |
|---|---|
| Password storage | Argon2id with memory=64MB, time=3, parallelism=1 |
| Session cookie | `HttpOnly`, `SameSite=Lax`, `Secure` in production |
| Session fixation | `req.session.regenerate()` on login |
| CSRF | Double-submit token via `X-CSRF-Token` header |
| User enumeration | Identical error message and a dummy verify call for unknown email |
| Identity trust | `senderId` always read from session, never from request body |
| XSS | `sanitize-html` strips all HTML/JS from message content server-side |
| NoSQL injection | `express-mongo-sanitize` strips `$`/`.` operators from all input |
| Security headers | `helmet` (CSP, HSTS, X-Frame-Options, etc.) |
| Rate limiting | Login: 10/15min; API: 120/min; Send message: 20/10sec |
| Secrets | All via environment variables; never in source code |
| Data leaks | `passwordHash` excluded from all query results and JSON output |
| Error messages | Generic user-facing text; internal errors logged server-side only |
| MongoDB connection | TLS enforced by Atlas; credentials in `DATABASE_URL` |

---

## Message retention (5M cap)

The system supports up to **5,000,000 messages**. Beyond that, oldest messages are automatically pruned.

**How it works:**

1. A `metas` collection holds a single counter document (`message_counter`).
2. After every insert, the counter is incremented atomically with `$inc`.
3. Every `RETENTION_CHECK_INTERVAL` inserts (default: 50), the counter is compared to `MAX_MESSAGES`.
4. If exceeded, the oldest `RETENTION_BATCH_SIZE` messages (default: 500) are deleted in a loop until the count is within bounds.
5. Deletions use an `_id`-targeted `deleteMany` (no full scan) aided by the `{ createdAt: 1 }` index.

This design ensures:
- No expensive `countDocuments()` on the request hot path
- Cleanup is amortized over many inserts, not per-insert
- Bulk deletes keep the operation bounded and predictable

---

## Performance notes

- **Cursor-based pagination** (`_id < cursor`) — avoids expensive `SKIP` offsets that degrade at scale.
- **Compound index** `(senderId, receiverId, createdAt DESC)` + inverse — both directions of the conversation are served from an index scan.
- **Projections** — message list queries never load `passwordHash` or unnecessary fields.
- **Connection pooling** — Mongoose pool: min 2, max 20 connections.
- **Session store** — `connect-mongo` with `touchAfter: 60s` avoids redundant DB writes on every request.
- The message list should remain fast at 5M messages because the pair-filter + sort is fully covered by the compound index.

---

## Production deployment

### Recommended: Railway / Render / Fly.io + MongoDB Atlas

1. **Create a MongoDB Atlas cluster** (free M0 → M10+ for production scale)

2. **Set environment variables** on your hosting platform (never commit `.env`):
   ```
   NODE_ENV=production
   DATABASE_URL=mongodb+srv://...
   SESSION_SECRET=<openssl rand -hex 64>
   CLIENT_ORIGIN=https://your-frontend.com
   USER1_EMAIL=...
   USER1_PASSWORD=...
   USER1_NAME=...
   USER2_EMAIL=...
   USER2_PASSWORD=...
   USER2_NAME=...
   ```

3. **Run the seed script once** (e.g. via the platform's one-off task runner or a local run pointing at the Atlas URI):
   ```bash
   DATABASE_URL=mongodb+srv://... \
   USER1_EMAIL=alice@prod.example.com \
   USER1_PASSWORD=... \
   USER1_NAME=Alice \
   USER2_EMAIL=bob@prod.example.com \
   USER2_PASSWORD=... \
   USER2_NAME=Bob \
   SESSION_SECRET=... \
   npm run seed
   ```

4. **Build and start:**
   ```bash
   npm run build
   npm start
   ```

5. **Atlas network access:** whitelist your server's egress IPs (or `0.0.0.0/0` temporarily while testing) in Atlas → Network Access.

6. **HTTPS:** Always terminate TLS at the proxy/load-balancer level. Set `NODE_ENV=production` so `Secure` cookie flag is enabled.

### Vercel edge note

Vercel Serverless functions do not support persistent WebSocket connections. For real-time messaging on Vercel, consider using a managed WebSocket service (e.g. Ably, Pusher) or deploying the backend on a platform that supports persistent processes (Railway, Fly.io, Render).

---

## Project structure

```
private-chat-backend/
├── scripts/
│   └── seed.ts              # Creates the two authorized users
├── src/
│   ├── config/
│   │   └── env.ts           # Validated env loader (fail-fast on missing vars)
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── messages.controller.ts
│   ├── db/
│   │   └── connect.ts       # Mongoose connection with pooling
│   ├── middleware/
│   │   ├── auth.ts          # requireAuth — reads session only
│   │   ├── csrf.ts          # Double-submit CSRF token
│   │   ├── errorHandler.ts  # Central error handler (no internal leak)
│   │   └── rateLimit.ts     # Per-route rate limiters
│   ├── models/
│   │   ├── Message.ts       # Message schema + indexes
│   │   ├── Meta.ts          # Counter document model
│   │   └── User.ts          # User schema (passwordHash excluded by default)
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   └── messages.routes.ts
│   ├── services/
│   │   ├── retention.ts     # 5M cap logic
│   │   └── users.ts         # Resolve "the other user"
│   ├── types/
│   │   └── express-session.d.ts
│   ├── utils/
│   │   ├── password.ts      # Argon2id hash/verify
│   │   ├── sanitize.ts      # XSS stripping
│   │   └── validation.ts    # Zod schemas
│   ├── websocket/
│   │   ├── events.ts        # Internal event bus
│   │   └── socket.ts        # Socket.IO setup
│   ├── app.ts               # Express app factory
│   └── server.ts            # Entry point (HTTP + Socket.IO)
├── tests/
│   ├── auth.test.ts
│   ├── helpers.ts           # Test app factory, seedTestUsers, loginAs
│   ├── messages.test.ts
│   ├── retention.test.ts
│   ├── security.test.ts
│   └── setup.ts             # Global Jest hooks (in-memory MongoDB)
├── .env.example
├── .gitignore
├── jest.config.js
├── package.json
├── README.md
└── tsconfig.json
```
