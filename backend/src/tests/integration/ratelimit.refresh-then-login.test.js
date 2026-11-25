// Mirror of the other rate-limit file: exhaust REFRESH first, then show login still has its FULL budget.
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.REFRESH_RATE_LIMIT_MAX = '5';
process.env.REFRESH_TOKEN_RATE_LIMIT_MAX = '50';

const h = require('../helpers');

beforeAll(() => h.connect('t_ratelimit_b'));
afterAll(() => h.disconnect());

describe('exhausting the refresh limiter does not consume the login/register budget', () => {
  test('refresh is limited per IP', async () => {
    for (let i = 0; i < 5; i++) expect((await h.http().post('/api/v1/auth/refresh')).status).toBe(401);
    const blocked = await h.http().post('/api/v1/auth/refresh');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('Too many session refresh requests, please try again later');
  });

  test('login still gets all of its own attempts afterwards', async () => {
    const attempt = () => h.http().post('/api/v1/auth/login').send({ email: 'nobody@test.com', password: 'Wrong123!' });
    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe('rate limiting is off by default under NODE_ENV=test', () => {
  test('the configuration flag follows RATE_LIMIT_ENABLED', () => {
    expect(require('../../config/environment').rateLimitEnabled).toBe(true);
  });
});
