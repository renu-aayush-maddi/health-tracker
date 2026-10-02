import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, NETWORK_ERROR_MESSAGE, setUnauthorizedHandler } from './apiClient.js';

const jsonResponse = (status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
  setUnauthorizedHandler(null);
});

describe('apiClient', () => {
  it('sends JSON with credentials and skips empty query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await api.post(
      '/health-events',
      { title: 'Fever' },
      { query: { q: 'fe', status: '', page: 1 } },
    );

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/health-events?q=fe&page=1');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{"title":"Fever"}',
    });
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('returns null for 204 responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(204)));
    await expect(api.delete('/health-events/1')).resolves.toBeNull();
  });

  it('turns API errors into ApiError with field messages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Please fix the highlighted fields.',
            fields: { endDate: 'End date cannot be earlier than start date.' },
          },
        }),
      ),
    );
    const error = await api.post('/health-events', {}).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: 'VALIDATION_ERROR',
      fields: { endDate: 'End date cannot be earlier than start date.' },
    });
  });

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api.get('/dashboard')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('never exposes raw server error pages', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 })),
    );
    await expect(api.get('/dashboard')).rejects.toMatchObject({
      status: 502,
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('calls the unauthorized handler on 401 unless the caller opts out', async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(jsonResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })),
        ),
    );

    await api.get('/dashboard').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await api.post('/auth/login', {}, { skipAuthRedirect: true }).catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe('slow request tracking', () => {
  it('flags requests that take longer than a few seconds, then clears', async () => {
    vi.useFakeTimers();
    const { hasSlowRequests, subscribeToSlowRequests } = await import('./apiClient.js');
    let resolveFetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolve) => (resolveFetch = resolve))),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeToSlowRequests(listener);

    const pending = api.get('/dashboard');
    expect(hasSlowRequests()).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(hasSlowRequests()).toBe(true);
    resolveFetch(jsonResponse(200, {}));
    await pending;
    expect(hasSlowRequests()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    vi.useRealTimers();
  });
});
