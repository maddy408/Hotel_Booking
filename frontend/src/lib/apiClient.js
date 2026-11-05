const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost/tamarind-court/backend/public';
const STORAGE_KEY = 'tamarind-court-auth';

export class ApiError extends Error {
  constructor(message, status, code, fields) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}

function loadTokens() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

let tokens = loadTokens();
let unauthorizedHandler = null;
let refreshPromise = null;

export function setTokens(next) {
  tokens = next;
  if (next) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function getTokens() {
  return tokens;
}

export function onUnauthorized(handler) {
  unauthorizedHandler = handler;
}

async function rawRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

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
