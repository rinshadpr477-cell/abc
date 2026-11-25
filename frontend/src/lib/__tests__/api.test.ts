import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { toast } from 'sonner';
import { ApiError, api, refreshSession, sessionExpired } from '@/lib/api';
import { orderService } from '@/services';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types';

const USER: User = { id: 'u1', name: 'Test User', email: 't@example.com', role: 'CUSTOMER', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };

type Reply = { status: number; data: unknown };
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>;

/** Replaces the HTTP layer of the shared axios instance with a scripted server (no network). */
function useServer(handler: Handler) {
  // `tokens` records the Authorization header AT CALL TIME (the replayed request reuses and mutates the same config).
  const seen = Object.assign([] as InternalAxiosRequestConfig[], { tokens: [] as string[] });
  api.defaults.adapter = async (config) => {
    seen.push(config);
    seen.tokens.push(String(config.headers?.Authorization ?? ''));
    const { status, data } = await handler(config);
    const response = { data, status, statusText: String(status), headers: {}, config } as AxiosResponse;
    if (status >= 400) throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response);
    return response;
  };
  return seen;
}

const ok = (data: unknown = { ok: true }): Reply => ({ status: 200, data: { success: true, data } });
const fail = (status: number, body: Record<string, unknown> = {}): Reply => ({ status, data: { success: false, ...body } });
const tokenOf = (c: InternalAxiosRequestConfig) => String(c.headers?.Authorization ?? '');

/** The global refresh call (plain axios, not the instance) resolves with a new access token. */
function mockRefresh(impl?: () => Promise<unknown>) {
  return vi.spyOn(axios, 'post').mockImplementation(
    impl ?? (async () => ({ data: { success: true, data: { accessToken: 'new-token', user: USER } } }))
  );
}

const assign = vi.fn();

beforeEach(() => {
  assign.mockReset();
  vi.stubGlobal('window', { location: { pathname: '/orders', search: '?page=2', assign } });
  useAuthStore.setState({ token: null, user: null, ready: false });
  vi.mocked(toast.error).mockClear();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refreshSession (single flight)', () => {
  test('concurrent callers share ONE refresh request and all receive the same session', async () => {
    const post = mockRefresh(() => new Promise((resolve) => setTimeout(() => resolve({ data: { data: { accessToken: 'tok-1', user: USER } } }), 20)));
    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(post).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.accessToken === 'tok-1')).toBe(true);
    expect(useAuthStore.getState().token).toBe('tok-1');
    expect(useAuthStore.getState().user?.email).toBe(USER.email);
    const [url, body, config] = post.mock.calls[0] as unknown as [string, unknown, { withCredentials: boolean }];
    expect(url).toMatch(/\/auth\/refresh$/);
    expect(body).toEqual({});
    expect(config.withCredentials).toBe(true); // the HttpOnly cookie travels with it
  });

  test('after the flight finishes the next call starts a new request', async () => {
    const post = mockRefresh();
    await refreshSession();
    await refreshSession();
    expect(post).toHaveBeenCalledTimes(2);
  });

  test('a failed refresh resolves to null, leaves the store alone, and does not poison later attempts', async () => {
    useAuthStore.setState({ token: 'old', user: USER });
    const post = mockRefresh(async () => {
      throw new Error('network down');
    });
    expect(await refreshSession()).toBeNull();
    expect(useAuthStore.getState().token).toBe('old');
    post.mockImplementation(async () => ({ data: { data: { accessToken: 'recovered', user: USER } } }));
    expect((await refreshSession())?.accessToken).toBe('recovered');
    expect(post).toHaveBeenCalledTimes(2);
  });
});

describe('401 handling: silent refresh and replay', () => {
  test('an expired access token is refreshed once and the original request is replayed with the new token', async () => {
    useAuthStore.setState({ token: 'old', user: USER });
    const post = mockRefresh();
    const seen = useServer((c) => (tokenOf(c) === 'Bearer old' ? fail(401, { code: 'TOKEN_EXPIRED', message: 'Access token expired' }) : ok({ orders: [] })));
    const res = await api.get('/orders/my-orders');
    expect(res.data.data).toEqual({ orders: [] });
    expect(post).toHaveBeenCalledTimes(1);
    expect(seen.tokens).toEqual(['Bearer old', 'Bearer new-token']);
    expect(assign).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('several requests expiring at once trigger exactly ONE refresh (no rotation race from this tab)', async () => {
    useAuthStore.setState({ token: 'old', user: USER });
    const post = mockRefresh(() => new Promise((resolve) => setTimeout(() => resolve({ data: { data: { accessToken: 'new-token', user: USER } } }), 25)));
    useServer((c) => (tokenOf(c) === 'Bearer old' ? fail(401) : ok()));
    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c'), api.get('/d')]);
    expect(results).toHaveLength(4);
    expect(post).toHaveBeenCalledTimes(1);
  });

  test('if the replay is rejected again it does NOT loop: one refresh only, then the error surfaces', async () => {
    useAuthStore.setState({ token: 'old', user: USER });
    const post = mockRefresh();
    useServer(() => fail(401, { message: 'still no' }));
    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('session-expired handling', () => {
  test('when the refresh fails: session cleared, "expired" toast, redirect to /login with the current page as ?next=', async () => {
    useAuthStore.setState({ token: 'old', user: USER, ready: true });
    mockRefresh(async () => {
      throw new Error('refresh rejected');
    });
    useServer(() => fail(401, { message: 'Access token expired' }));
    await expect(api.get('/orders/my-orders')).rejects.toMatchObject({ name: 'ApiError', status: 401 });
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
    expect(toast.error).toHaveBeenCalledWith('Your session has expired. Please sign in again.');
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login?next=%2Forders%3Fpage%3D2&reason=expired'); // the reason survives the full reload (a toast would not)
  });

  test('the ?next= value built here is accepted by the safe-redirect validator', async () => {
    const { safeNextPath } = await import('@/lib/redirect');
    sessionExpired();
    const target = String(assign.mock.calls[0][0]);
    const next = new URL(target, 'http://localhost:3100').searchParams.get('next');
    expect(safeNextPath(next, '/', 'http://localhost:3100')).toBe('/orders?page=2');
  });

  test('a deactivated account (403 ACCOUNT_INACTIVE) ends the session with its own message', async () => {
    useAuthStore.setState({ token: 'tok', user: USER, ready: true });
    const post = mockRefresh();
    useServer(() => fail(403, { code: 'ACCOUNT_INACTIVE', message: 'Your account has been deactivated' }));
    await expect(api.get('/auth/me')).rejects.toMatchObject({ status: 403, code: 'ACCOUNT_INACTIVE' });
    expect(post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Your account has been deactivated.');
    expect(useAuthStore.getState().token).toBeNull();
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith('/login?next=%2Forders%3Fpage%3D2&reason=deactivated');
  });

  test('no toast and no redirect loop when already on the login page', () => {
    vi.stubGlobal('window', { location: { pathname: '/login', search: '', assign } });
    useAuthStore.setState({ token: 'tok', user: USER });
    sessionExpired();
    expect(assign).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBeNull();
  });

  test('no "expired" toast when there was no session to begin with, but the user is still sent to login', () => {
    sessionExpired();
    expect(toast.error).not.toHaveBeenCalled();
    expect(assign).toHaveBeenCalledTimes(1);
  });
});

describe('requests that must NOT trigger a refresh', () => {
  test('a wrong password (401 on /auth/login) is shown to the caller and never refreshes or logs out', async () => {
    useAuthStore.setState({ token: 'tok', user: USER });
    const post = mockRefresh();
    useServer(() => fail(401, { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }));
    await expect(api.post('/auth/login', { email: 'a@b.co', password: 'x' })).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    expect(post).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(useAuthStore.getState().token).toBe('tok');
  });

  test('a 401 for an anonymous visitor (no access token) does not refresh', async () => {
    const post = mockRefresh();
    useServer(() => fail(401, { message: 'Authentication required' }));
    await expect(api.get('/orders/my-orders')).rejects.toBeInstanceOf(ApiError);
    expect(post).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled(); // 401s never show the generic error toast
  });
});

describe('error normalisation, toasts and retry behaviour', () => {
  test('server validation errors keep status, code and field messages', async () => {
    useServer(() => fail(422, { code: 'VALIDATION_ERROR', message: 'Validation failed', errors: [{ field: 'imageUrl', message: 'Image URL must be a valid http or https URL' }] }));
    const err = (await api.post('/products', {}).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.errors?.[0]).toEqual({ field: 'imageUrl', message: 'Image URL must be a valid http or https URL' });
    expect(err.isNetwork).toBe(false);
  });

  test('a server error shows exactly one toast with the server message', async () => {
    useServer(() => fail(409, { code: 'INSUFFICIENT_STOCK', message: 'Insufficient stock for "Widget" (requested 5, available 2)' }));
    await expect(api.post('/orders', {})).rejects.toMatchObject({ status: 409, code: 'INSUFFICIENT_STOCK' });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Insufficient stock for "Widget" (requested 5, available 2)');
  });

  test('skipGlobalErrorToast lets the caller show the error itself', async () => {
    useServer(() => fail(404, { message: 'Product not found' }));
    await expect(api.get('/products/x', { skipGlobalErrorToast: true })).rejects.toMatchObject({ status: 404 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('a network failure becomes a friendly "service unavailable" error flagged isNetwork', async () => {
    api.defaults.adapter = async (config) => {
      throw new AxiosError('Network Error', 'ERR_NETWORK', config);
    };
    const err = (await api.get('/products').catch((e: unknown) => e)) as ApiError;
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/unavailable/i);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('a transient failure can be retried by the caller and then succeeds', async () => {
    let calls = 0;
    useServer(() => (++calls === 1 ? fail(503, { message: 'Service unavailable' }) : ok({ fine: true })));
    await expect(api.get('/health-ish')).rejects.toMatchObject({ status: 503 });
    const retry = await api.get('/health-ish');
    expect(retry.data.data).toEqual({ fine: true });
    expect(calls).toBe(2);
  });
});

describe('order placement request', () => {
  test('sends ids and quantities only plus the Idempotency-Key header (never prices or totals)', async () => {
    useAuthStore.setState({ token: 'tok', user: USER });
    const seen = useServer(() => ({ status: 201, data: { success: true, data: { id: 'o1', orderNumber: 'ORD-1' } } }));
    await orderService.place([{ productId: '507f1f77bcf86cd799439011', quantity: 2 }], 'chk-key-123');
    const config = seen[0];
    expect(config.method).toBe('post');
    expect(config.url).toBe('/orders');
    expect(JSON.parse(String(config.data))).toEqual({ items: [{ productId: '507f1f77bcf86cd799439011', quantity: 2 }] });
    expect(String(config.data)).not.toMatch(/price|total|name|sku/i);
    expect(config.headers?.['Idempotency-Key']).toBe('chk-key-123');
  });

  test('a 409 for a reused key surfaces the server message so the user is told why', async () => {
    useAuthStore.setState({ token: 'tok', user: USER });
    useServer(() => fail(409, { code: 'IDEMPOTENCY_KEY_REUSED', message: 'This Idempotency-Key was already used with a different order.' }));
    await expect(orderService.place([{ productId: '507f1f77bcf86cd799439011', quantity: 1 }], 'chk-old'))
      .rejects.toMatchObject({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED' });
  });
});
