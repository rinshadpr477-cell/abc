const mongoose = require('mongoose');
const h = require('../helpers');

beforeAll(() => h.connect('t_cors_health'));
afterAll(() => h.disconnect());
afterEach(() => vi.restoreAllMocks());

describe('CORS', () => {
  const ALLOWED = 'http://localhost:3000'; // default CORS_ORIGIN in the test environment
  const get = (origin) => {
    const r = h.http().get('/api/v1/categories/tree');
    return origin ? r.set('Origin', origin) : r;
  };

  test('an allowed origin gets its own origin echoed back with credentials enabled', async () => {
    const res = await get(ALLOWED);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test('preflight from an allowed origin succeeds with the requested method/headers', async () => {
    const res = await h.http().options('/api/v1/auth/login').set('Origin', ALLOWED)
      .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'content-type,authorization');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  test.each([
    ['unknown origin', 'https://evil.example.com'],
    ['same host, other port', 'http://localhost:3999'],
    ['look-alike suffix', 'http://localhost:3000.evil.com'],
    ['scheme mismatch', 'https://localhost:3000'],
    ['null origin', 'null'],
  ])('a disallowed origin (%s) receives no CORS grant', async (_n, origin) => {
    const res = await get(origin);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await h.http().options('/api/v1/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('wildcard is never returned (credentials are in use)', async () => {
    expect((await get(ALLOWED)).headers['access-control-allow-origin']).not.toBe('*');
  });

  test('requests without an Origin header (curl, server-to-server) still work', async () => {
    expect((await get()).status).toBe(200);
  });
});

describe('GET /health (database-aware)', () => {
  test('200 when MongoDB answers a ping', async () => {
    const res = await h.http().get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok', database: 'up' } });
  });

  test('503 when the connection is not established', async () => {
    const state = vi.spyOn(mongoose.connection, 'readyState', 'get').mockReturnValue(0);
    try {
      const res = await h.http().get('/health');
      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toEqual({ status: 'unavailable', database: 'down' });
    } finally {
      state.mockRestore(); // getter spies are not reliably reset by restoreAllMocks
    }
    expect(mongoose.connection.readyState).toBe(1);
  });

  test('503 when the ping fails, and the driver error text / URI never reaches the client', async () => {
    vi.spyOn(mongoose.connection.db, 'admin').mockReturnValue({
      ping: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.9:27017 LEAK-MARKER-7f3a stack at Object.<anonymous>')),
    });
    const res = await h.http().get('/health');
    expect(res.status).toBe(503);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/LEAK-MARKER|10.0.0.9|ECONNREFUSED|mongodb|stack|at Object/i);
  });

  test('503 (not a hang) when the ping never returns', async () => {
    vi.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ ping: () => new Promise(() => {}) });
    const started = Date.now();
    const res = await h.http().get('/health');
    expect(res.status).toBe(503);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  test('is read-only: it only pings and never writes', async () => {
    const ping = vi.fn().mockResolvedValue({ ok: 1 });
    vi.spyOn(mongoose.connection.db, 'admin').mockReturnValue({ ping });
    const write = vi.spyOn(mongoose.connection.db, 'collection');
    const res = await h.http().get('/health');
    expect(res.status).toBe(200);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(write).not.toHaveBeenCalled();
  });

  test('is reachable without authentication', async () => {
    expect((await h.http().get('/health')).status).toBe(200);
  });
});
