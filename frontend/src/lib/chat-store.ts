// Frontend-only mock layer. Swap these functions for real API calls later:
// POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me,
// GET /api/messages?limit=50&before=<cursor>, POST /api/messages

export type ChatUser = { id: string; name: string; email: string };

export type Message = {
  id: string;
  senderId: string;
  content: string;
  createdAt: number;
  status: "sent" | "delivered" | "read";
};

export const USERS: Array<ChatUser & { password: string }> = [
  { id: "u1", name: "Aarav", email: "aarav@example.com", password: "password1" },
  { id: "u2", name: "Meera", email: "meera@example.com", password: "password2" },
];

const SESSION_KEY = "pc.session";
const MESSAGES_KEY = "pc.messages";
const MAX_MESSAGES = 5_000_000;

const isBrowser = () => typeof window !== "undefined";

export function otherUser(id: string): ChatUser {
  const other = USERS.find((u) => u.id !== id)!;
  return { id: other.id, name: other.name, email: other.email };
}

export function getSession(): ChatUser | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as ChatUser) : null;
  } catch {
    return null;
  }
}

export function login(identifier: string, password: string): ChatUser | null {
  const id = identifier.trim().toLowerCase();
  const found = USERS.find(
    (u) => (u.email.toLowerCase() === id || u.name.toLowerCase() === id) && u.password === password,
  );
  if (!found) return null;
  const session: ChatUser = { id: found.id, name: found.name, email: found.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout() {
  if (isBrowser()) localStorage.removeItem(SESSION_KEY);
}

function seed(): Message[] {
  const now = Date.now();
  const base = [
    ["u2", "Hello 👋"],
    ["u1", "Hey! How are you?"],
    ["u2", "I'm good! Just finished work."],
    ["u1", "Nice. Want to catch up tonight?"],
    ["u2", "Sounds perfect."],
  ] as const;
  return base.map(([senderId, content], i) => ({
    id: `seed-${i}`,
    senderId,
    content,
    createdAt: now - (base.length - i) * 1000 * 60 * 7,
    status: "read" as const,
  }));
}

function readAll(): Message[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(MESSAGES_KEY);
    if (!raw) {
      const s = seed();
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as Message[];
  } catch {
    return [];
  }
}

function writeAll(messages: Message[]) {
  // Retention: keep at most MAX_MESSAGES, dropping oldest first.
  const trimmed =
    messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages;
  localStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
}

export const PAGE_SIZE = 50;

/** Cursor-based page: newest `limit` messages older than `before` (a message id). */
export function getMessages(opts: { limit?: number; before?: string } = {}): {
  messages: Message[];
  hasMore: boolean;
} {
  const limit = opts.limit ?? PAGE_SIZE;
  const all = readAll();
  const end = opts.before ? all.findIndex((m) => m.id === opts.before) : all.length;
  const stop = end < 0 ? all.length : end;
  const start = Math.max(0, stop - limit);
  return { messages: all.slice(start, stop), hasMore: start > 0 };
}

export function getSince(afterId: string | null): Message[] {
  const all = readAll();
  if (!afterId) return [];
  const idx = all.findIndex((m) => m.id === afterId);
  return idx < 0 ? [] : all.slice(idx + 1);
}

export const MAX_LENGTH = 2000;

export function sendMessage(senderId: string, content: string): Message {
  const trimmed = content.trim().slice(0, MAX_LENGTH);
  const message: Message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    senderId,
    content: trimmed,
    createdAt: Date.now(),
    status: "sent",
  };
  const all = readAll();
  all.push(message);
  writeAll(all);
  return message;
}

export function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
