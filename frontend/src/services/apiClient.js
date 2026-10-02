// Single place where the frontend talks HTTP. UI code calls the service modules, never fetch().

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const REQUEST_TIMEOUT_MS = 60_000; // generous: a sleeping Render free instance can take ~50s to wake
const SLOW_REQUEST_MS = 5_000;

export const NETWORK_ERROR_MESSAGE = 'Unable to connect to the server. Please try again.';
const GENERIC_ERROR_MESSAGE = 'Something went wrong. Please try again.';

export class ApiError extends Error {
  constructor({ status = 0, code = 'UNKNOWN', message = GENERIC_ERROR_MESSAGE, fields } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

let unauthorizedHandler = null;
const slowListeners = new Set();
let pendingSlow = 0;

/** AuthContext registers this so an expired session anywhere sends the user back to login. */
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

/** Subscribe to "a request is taking unusually long" (e.g. server cold start). */
export function subscribeToSlowRequests(listener) {
  slowListeners.add(listener);
  return () => slowListeners.delete(listener);
}

export function hasSlowRequests() {
  return pendingSlow > 0;
}

function notifySlow(delta) {
  pendingSlow += delta;
  slowListeners.forEach((listener) => listener());
}

function buildUrl(path, query) {
  const url = `${BASE_URL}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value));
  });
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

function toApiError(status, data) {
  return new ApiError({
    status,
    code: data?.error?.code ?? (status >= 500 ? 'INTERNAL_ERROR' : 'UNKNOWN'),
    message:
      data?.error?.message ??
      (status >= 502 && status <= 504 ? NETWORK_ERROR_MESSAGE : GENERIC_ERROR_MESSAGE),
    fields: data?.error?.fields,
  });
}

async function parseBody(response) {
  if (response.status === 204) return null;
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function apiRequest(
  path,
  { method = 'GET', body, query, signal, skipAuthRedirect } = {},
) {
  const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  let markedSlow = false;
  const slowTimer = setTimeout(() => {
    markedSlow = true;
    notifySlow(1);
  }, SLOW_REQUEST_MS);

  let response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combinedSignal,
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled (e.g. component unmounted); not a user-facing error
    throw new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE });
  } finally {
    clearTimeout(slowTimer);
    if (markedSlow) notifySlow(-1);
  }

  const data = await parseBody(response);

  if (response.ok) return data;

  const error = toApiError(response.status, data);
  if (response.status === 401 && !skipAuthRedirect && unauthorizedHandler) {
    unauthorizedHandler();
  }
  throw error;
}

export const api = {
  get: (path, options) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options) => apiRequest(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => apiRequest(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => apiRequest(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => apiRequest(path, { ...options, method: 'DELETE' }),
};

/**
 * Uploads one file as multipart/form-data (field "file"). Uses XMLHttpRequest because fetch
 * cannot report upload progress. `onProgress` receives a fraction from 0 to 1; `fields` are extra
 * text parts sent alongside the file.
 */
export function uploadFile(path, file, { onProgress, signal, fields } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}${path}`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.timeout = 5 * 60_000;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.response);
      if (xhr.status === 401 && unauthorizedHandler) unauthorizedHandler();
      reject(toApiError(xhr.status, xhr.response));
    };
    const networkError = () =>
      reject(new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE }));
    xhr.onerror = networkError;
    xhr.ontimeout = networkError;
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());

    const body = new FormData();
    Object.entries(fields ?? {}).forEach(([name, value]) => body.append(name, value));
    body.append('file', file);
    xhr.send(body);
  });
}

/** GETs a file and saves it with the server-provided name, surfacing API errors as ApiError. */
export async function downloadFile(path, fallbackName = 'download') {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_ERROR_MESSAGE });
  }
  if (!response.ok) {
    if (response.status === 401 && unauthorizedHandler) unauthorizedHandler();
    throw toApiError(response.status, await parseBody(response));
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return filename;
}
