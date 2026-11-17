import { loadTokens, saveTokens } from '../storage/secureStorage';

// Expo inlines EXPO_PUBLIC_* vars into the bundle at build time (dev and prod both
// read from mobile/.env — see .env.example for the dev-vs-prod split).
export const BASE_URL = (process.env.EXPO_PUBLIC_API_URL || '').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(message, status, code, fields) {
    const fieldMessages = fields ? Object.values(fields).filter(Boolean) : [];
    // The backend's top-level message for a 422 is just "Validation failed" — the useful
    // detail is in `fields`. Fold it into the displayed message so toasts/forms are helpful.
    const combined = fieldMessages.length ? fieldMessages.join(' ') : message;
    super(combined);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}

let tokens = null;
let authReady = null;
let unauthorizedHandler = null;
let refreshPromise = null;

/** Must be awaited once before the app renders (see App.jsx) so synchronous reads below work. */
export function initAuth() {
  if (!authReady) {
    authReady = loadTokens().then((t) => {
      tokens = t;
      return t;
    });
  }
  return authReady;
}

export function setTokens(next) {
  tokens = next;
  // Fire-and-forget persistence — in-memory `tokens` is the source of truth for
  // the current session; SecureStore just needs to catch up before next launch.
  saveTokens(next).catch(() => {});
}

export function getTokens() {
  return tokens;
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function rawRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (auth && tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`;

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your internet connection.', 0, 'network_error');
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('The server sent back something unexpected.', res.status, 'bad_response');
  }

  if (!payload.success) {
    throw new ApiError(payload.error?.message || 'Something went wrong.', res.status, payload.error?.code, payload.error?.fields);
  }
  return payload.data;
}

async function tryRefresh() {
  if (!tokens?.refreshToken) return false;
  if (!refreshPromise) {
    refreshPromise = rawRequest('/auth/refresh', { method: 'POST', body: { refreshToken: tokens.refreshToken }, auth: false })
      .then((data) => {
        setTokens(data);
        return true;
      })
      .catch(() => {
        setTokens(null);
        return false;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function request(path, options = {}) {
  try {
    return await rawRequest(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && options.auth !== false) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        return rawRequest(path, options);
      }
      unauthorizedHandler?.();
    }
    throw err;
  }
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  put: (path, body) => request(path, { method: 'PUT', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ?? {} }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
