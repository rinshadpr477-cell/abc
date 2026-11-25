// Limits are tiny and enabled for THIS file only. They must be set before the app is loaded.
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.REFRESH_RATE_LIMIT_MAX = '8';
process.env.REFRESH_TOKEN_RATE_LIMIT_MAX = '4';

const h = require('../helpers');
const authService = require('../../services/auth.service');

const { User } = h.models;

beforeAll(() => h.connect('t_ratelimit_a'));
afterAll(() => h.disconnect());

const bad = () => h.http().post('/api/v1/auth/login').send({ email: 'nobody@test.com', password: 'Wrong123!' });
const refreshWith = (cookie) => {
  const r = h.http().post('/api/v1/auth/refresh');
  return cookie ? r.set('Cookie', cookie) : r;
};

describe('rate limiting: login/register vs refresh are independent', () => {
  let cookie;
  beforeAll(async () => {
    // Created through the service layer so the setup does not spend the HTTP login budget.
    await User.create({ name: 'RL User', email: 'rl@test.com', password: await authService.hashPassword('Passw0rd!'), role: 'CUSTOMER' });
    const s = await authService.login({ email: 'rl@test.com', password: 'Passw0rd!' });
    cookie = `refreshToken=${s.refreshToken}`;
  });

  test('login is limited after AUTH_RATE_LIMIT_MAX attempts with a clear, secret-free 429', async () => {
    for (let i = 0; i < 3; i++) expect((await bad()).status).toBe(401);
    const blocked = await bad();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, code: 'RATE_LIMITED', message: 'Too many authentication attempts, please try again later' });
    expect(blocked.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(blocked.body) + JSON.stringify(blocked.headers)).not.toMatch(/token|jwt|session|bearer/i);
    expect(blocked.headers['ratelimit-policy'] || blocked.headers['ratelimit']).toBeTruthy();
  });

  test('register shares the login budget (still exhausted)', async () => {
    const r = await h.http().post('/api/v1/auth/register').send({ name: 'Nope', email: 'nope@test.com', password: 'Passw0rd!' });
    expect(r.status).toBe(429);
  });

  test('refresh is NOT affected by the exhausted login budget: normal page reloads keep working', async () => {
    let current = cookie;
    for (let i = 0; i < 3; i++) {
      const r = await refreshWith(current);
      expect(r.status).toBe(200);
      current = (r.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('refreshToken='));
    }
    // read-only API traffic is unaffected as well
    expect((await h.http().get('/api/v1/categories/tree')).status).toBe(200);
  });

  test('refresh has a per-token limit: a replayed token is throttled, with a refresh-specific 429', async () => {
    // 3 requests already used by the IP limiter above. A looping client replays one cookie value.
    const junk = 'refreshToken=replayed-token-value';
    for (let i = 0; i < 4; i++) expect((await refreshWith(junk)).status).toBe(401);
    const blocked = await refreshWith(junk);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ success: false, code: 'RATE_LIMITED', message: 'Too many session refresh requests, please try again later' });
    expect(blocked.headers['set-cookie']).toBeUndefined();
  });

  test('refresh has a per-IP limit that covers cookie-less requests too', async () => {
    // IP budget: 3 valid + 5 junk = 8 used.
    const over = await refreshWith();
    expect(over.status).toBe(429);
    expect(over.body.code).toBe('RATE_LIMITED');
  });
});
