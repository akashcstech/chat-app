/**
 * Replaces the old localStorage mock layer.
 * All functions now call the real Express backend at http://localhost:4000.
 *
 * API surface used:
 *   POST   /api/auth/login
 *   POST   /api/auth/logout
 *   GET    /api/auth/me
 *   GET    /api/users/peer
 *   GET    /api/messages?limit=N&before=<cursor>
 *   POST   /api/messages
 */

import { apiFetch, clearCsrfToken, setCsrfToken, getCsrfToken, BACKEND_URL } from './api';

// ── Shared types ────────────────────────────────────────────────────────────
export type ChatUser = { id: string; name: string; email: string; isAdmin?: boolean };

export type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: number; // unix ms
  status: 'sent' | 'delivered' | 'read';
};

// ── Session cache (sessionStorage so it clears on tab close) ────────────────
const SESSION_KEY = 'pc.session';
const PEER_KEY = 'pc.peer';

function readCache<T>(key: string): T | null {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(key, JSON.stringify(value));
  }
}

function clearCache() {
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(PEER_KEY);
  }
  clearCsrfToken();
}

// ── Backend response shapes ─────────────────────────────────────────────────
type BackendUser = { id: string; username: string; email: string; isAdmin?: boolean };
type AuthResponse = { user: BackendUser; csrfToken: string };

function mapUser(u: BackendUser): ChatUser {
  return { id: u.id, name: u.username, email: u.email, isAdmin: u.isAdmin };
}

// ── Auth ────────────────────────────────────────────────────────────────────
export async function login(email: string, password: string): Promise<ChatUser> {
  const data = await apiFetch<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  setCsrfToken(data.csrfToken);
  const user = mapUser(data.user);
  writeCache(SESSION_KEY, user);
  return user;
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  clearCache();
}

/**
 * Returns the current session user from cache or by calling /api/auth/me.
 * Returns null when the session has expired / user is not logged in.
 */
export async function getSession(): Promise<ChatUser | null> {
  const cached = readCache<ChatUser>(SESSION_KEY);
  if (cached) return cached;

  try {
    const data = await apiFetch<AuthResponse>('/api/auth/me');
    setCsrfToken(data.csrfToken);
    const user = mapUser(data.user);
    writeCache(SESSION_KEY, user);
    return user;
  } catch {
    return null;
  }
}

// ── Peer user ───────────────────────────────────────────────────────────────
/** Returns the other authorised user's public profile (for the chat header). */
export async function getPeerUser(): Promise<ChatUser | null> {
  const cached = readCache<ChatUser>(PEER_KEY);
  if (cached) return cached;

  try {
    const data = await apiFetch<{ user: BackendUser }>('/api/users/peer');
    const peer = mapUser(data.user);
    writeCache(PEER_KEY, peer);
    return peer;
  } catch {
    return null;
  }
}

// ── Messages ────────────────────────────────────────────────────────────────
export const PAGE_SIZE = 20;
export const MAX_LENGTH = 2000;

type BackendMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string; // ISO date string from MongoDB
};

function toMs(val: string | number): number {
  return typeof val === 'number' ? val : new Date(val).getTime();
}

function mapMessage(m: BackendMessage, status: Message['status'] = 'read'): Message {
  return {
    id: m.id,
    senderId: m.senderId,
    receiverId: m.receiverId,
    content: m.content,
    createdAt: toMs(m.createdAt),
    status,
  };
}

/**
 * Cursor-based page. Backend returns newest-first; we reverse so the UI sees
 * oldest-first within the page (consistent with the previous mock behaviour).
 */
export async function getMessages(opts: { limit?: number; before?: string } = {}): Promise<{
  messages: Message[];
  nextCursor: string | null;
}> {
  const limit = opts.limit ?? PAGE_SIZE;
  const params = new URLSearchParams({ limit: String(limit) });
  if (opts.before) params.set('before', opts.before);

  const data = await apiFetch<{ messages: BackendMessage[]; nextCursor: string | null }>(
    `/api/messages?${params.toString()}`,
  );

  return {
    // Backend sends newest → oldest; reverse so UI shows oldest → newest
    messages: [...data.messages].reverse().map((m) => mapMessage(m)),
    nextCursor: data.nextCursor,
  };
}

export async function sendMessage(content: string): Promise<Message> {
  const data = await apiFetch<{ message: BackendMessage }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify({ content: content.trim().slice(0, MAX_LENGTH) }),
  });
  return mapMessage(data.message, 'sent');
}

// ── Helpers ─────────────────────────────────────────────────────────────────
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── Admin ───────────────────────────────────────────────────────────────────

export const MESSAGE_CAP = 500_000;

/** Fetches live {messageCount, cap} from /api/admin/stats. */
export async function getDbStats(): Promise<{ messageCount: number; cap: number }> {
  return apiFetch<{ messageCount: number; cap: number }>('/api/admin/stats');
}

/**
 * Triggers CSV export-and-reset.
 * Returns a Blob that the caller must programmatically download before
 * the server has already wiped the database by then.
 */
export async function exportAndReset(): Promise<void> {
  const csrfToken = getCsrfToken();
  const res = await fetch(`${BACKEND_URL}/api/admin/export-and-reset`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `Export failed: HTTP ${res.status}`);
  }

  // Stream the CSV blob and trigger a browser download
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="(.+?)"/);
  const filename = match ? match[1] : 'chat-export.csv';

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
