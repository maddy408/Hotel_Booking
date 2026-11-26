import { loadTokens, saveTokens } from '../storage/secureStorage';

function getExpoHostIp() {
  try {
    const Constants = require('expo-constants')?.default || require('expo-constants');
    const hostUri =
      Constants?.expoConfig?.hostUri ||
      Constants?.manifest?.hostUri ||
      Constants?.manifest2?.extra?.expoGo?.debuggerHost;
    if (hostUri) {
      const host = hostUri.split(':')[0];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        return host;
      }
    }
  } catch {
    // Graceful fallback for non-Expo or Node environments
  }
  return null;
}

let activeBaseUrl = null;

export function getCandidateBaseUrls() {
  const candidates = [];
  const envUrl = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (envUrl && !envUrl.includes('hotel-booking.ethiodeploy.app')) {
    candidates.push(envUrl);
  }
  const hostIp = getExpoHostIp();
  if (hostIp) {
    const expoUrl = `http://${hostIp}:8080`;
    if (!candidates.includes(expoUrl)) candidates.push(expoUrl);
  }
  const fallbackList = [
    'http://10.0.2.2:8080',      // Android emulator host loopback
    'http://192.168.1.102:8080',  // Host Wi-Fi IP
    'http://localhost:8080',      // Localhost / adb reverse
    'http://127.0.0.1:8080',
  ];
  for (const url of fallbackList) {
    if (!candidates.includes(url)) {
      candidates.push(url);
    }
  }
  return candidates;
}

export function resolveBaseUrl() {
  if (activeBaseUrl) return activeBaseUrl;
  const candidates = getCandidateBaseUrls();
  return candidates[0] || 'http://192.168.1.102:8080';
}

export const BASE_URL = resolveBaseUrl();

export class ApiError extends Error {
  constructor(message, status, code, fields) {
    let combined = message;
    if (status === 422 && fields && typeof fields === 'object') {
      const entries = Object.entries(fields).filter(([, v]) => Boolean(v));
      if (entries.length > 0) {
        // Fold validation field details into a readable error message without repeating generic text
        combined = entries
          .map(([k, v]) => (k && !v.toLowerCase().includes(k.toLowerCase()) ? `${k}: ${v}` : v))
          .join(' · ');
      }
    }
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

function requestViaXHR(path, { method = 'POST', body, auth = true } = {}) {
  const candidates = activeBaseUrl
    ? [activeBaseUrl, ...getCandidateBaseUrls().filter((u) => u !== activeBaseUrl)]
    : getCandidateBaseUrls();

  return new Promise((resolve, reject) => {
    let index = 0;

    function trySend(baseUrl) {
      const xhr = new XMLHttpRequest();
      xhr.open(method, `${baseUrl}${path}`);
      xhr.timeout = 5000;

      if (auth && tokens?.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${tokens.accessToken}`);
      }

      xhr.onload = () => {
        activeBaseUrl = baseUrl;
        let payload;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          return reject(new ApiError('The server sent back something unexpected.', xhr.status, 'bad_response'));
        }

        if (!payload.success) {
          return reject(
            new ApiError(
              payload.error?.message || 'Something went wrong.',
              xhr.status,
              payload.error?.code,
              payload.error?.fields
            )
          );
        }
        resolve(payload.data);
      };

      xhr.onerror = (e) => {
        index++;
        if (index < candidates.length) {
          trySend(candidates[index]);
        } else {
          console.error(`XHR failure on ${method} ${path}:`, e);
          reject(new ApiError('Could not reach the server. Check your internet connection.', 0, 'network_error'));
        }
      };

      xhr.ontimeout = () => {
        index++;
        if (index < candidates.length) {
          trySend(candidates[index]);
        } else {
          reject(new ApiError('Request timed out. Check your internet connection.', 0, 'timeout'));
        }
      };

      xhr.send(body);
    }

    trySend(candidates[0]);
  });
}

async function rawRequest(path, { method = 'GET', body, auth = true } = {}) {
  const isFormData = Boolean(
    body && (
      (typeof FormData !== 'undefined' && body instanceof FormData) ||
      typeof body.append === 'function' ||
      Array.isArray(body._parts)
    )
  );

  // In React Native / Expo, global fetch uses WinterCG convertFormData which rejects
  // legacy RN FormData parts ({ uri, name, type }) with "Unsupported FormDataPart implementation".
  // XMLHttpRequest delegates directly to native Android OkHttp NetworkingModule with full file support.
  if (isFormData) {
    return requestViaXHR(path, { method, body, auth });
  }

  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && tokens?.accessToken) headers['Authorization'] = `Bearer ${tokens.accessToken}`;

  const candidates = activeBaseUrl
    ? [activeBaseUrl, ...getCandidateBaseUrls().filter((u) => u !== activeBaseUrl)]
    : getCandidateBaseUrls();

  let res;
  let err = null;

  for (const baseUrl of candidates) {
    let timeoutId = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (controller) timeoutId = setTimeout(() => controller.abort(), 5000);

      res = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller?.signal,
      });
      if (timeoutId) clearTimeout(timeoutId);
      activeBaseUrl = baseUrl;
      err = null;
      break;
    } catch (e) {
      if (timeoutId) clearTimeout(timeoutId);
      err = e;
    }
  }

  if (err || !res) {
    console.error(`Fetch failure on ${method} ${path}:`, err);
    const detail = err?.message ? `: ${err.message}` : '';
    throw new ApiError(`Could not reach the server${detail}. Check your internet connection.`, 0, 'network_error');
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
