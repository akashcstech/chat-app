/**
 * Thin HTTP client for the backend.
 * - Always sends credentials (session cookie)
 * - Automatically attaches the CSRF token for mutating requests
 */

export const BACKEND_URL = import.meta.env['VITE_BACKEND_URL'] ?? 'http://localhost:4000';
const CSRF_KEY = 'pc.csrf';

// In-memory CSRF token (populated after login / me)
let _csrfToken: string | null =
  typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CSRF_KEY) : null;

export function getCsrfToken(): string | null {
  return _csrfToken;
}

export function setCsrfToken(token: string) {
  _csrfToken = token;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.setItem(CSRF_KEY, token);
  }
}

export function clearCsrfToken() {
  _csrfToken = null;
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem(CSRF_KEY);
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const isMutating = method !== 'GET' && method !== 'HEAD';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (isMutating && _csrfToken) {
    headers['X-CSRF-Token'] = _csrfToken;
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string, error?: string };
    throw new Error(body.error ?? body.message ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}
