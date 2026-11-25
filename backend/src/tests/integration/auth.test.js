const h = require('../helpers');

beforeAll(() => h.connect('t_auth'));
afterAll(() => h.disconnect());
beforeEach(() => h.clearAll());

describe('Auth', () => {
  test('registers a customer, never returns the password hash, and sets an HttpOnly refresh cookie', async () => {
    const res = await h.http().post('/api/v1/auth/register').send({ name: 'Jane', email: 'Jane@Example.com', password: 'Passw0rd!' });
    expect(res.status).toBe(201);
    expect(res.body.data.user).toMatchObject({ email: 'jane@example.com', role: 'CUSTOMER' });
    expect(res.body.data.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
    expect(res.headers['set-cookie'].join(';')).toMatch(/refreshToken=.*HttpOnly/i);
  });

  test('public registration cannot create an admin', async () => {
    const res = await h.http().post('/api/v1/auth/register').send({ name: 'Eve', email: 'eve@x.com', password: 'Passw0rd!', role: 'ADMIN' });
    expect(res.status).toBe(422);
    expect(await h.models.User.countDocuments({ role: 'ADMIN' })).toBe(0);
  });

  test('rejects duplicate email (case-insensitive) and weak passwords', async () => {
    await h.registerCustomer();
    const first = await h.models.User.findOne();
    const dup = await h.http().post('/api/v1/auth/register').send({ name: 'Dup', email: first.email.toUpperCase(), password: 'Passw0rd!' });
    expect(dup.status).toBe(409);
    const weak = await h.http().post('/api/v1/auth/register').send({ name: 'Weak', email: 'w@x.com', password: 'short' });
    expect(weak.status).toBe(422);
  });

  test('invalid credentials give 401 with a generic message', async () => {
    const c = await h.registerCustomer();
    const bad = await h.http().post('/api/v1/auth/login').send({ email: c.email, password: 'Wrong123!' });
    const unknown = await h.http().post('/api/v1/auth/login').send({ email: 'nobody@x.com', password: 'Wrong123!' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.message).toBe(unknown.body.message);
  });

  test('inactive user cannot log in and an existing token stops working', async () => {
    const admin = await h.createAdmin();
    const c = await h.registerCustomer();
    const off = await h.http().patch(`/api/v1/users/${c.user.id}/status`).set(h.auth(admin)).send({ isActive: false });
    expect(off.status).toBe(200);
    const login = await h.http().post('/api/v1/auth/login').send({ email: c.email, password: 'Passw0rd!' });
    expect(login.status).toBe(403);
    const me = await h.http().get('/api/v1/auth/me').set(h.auth(c));
    expect(me.status).toBe(403);
  });

  test('protected route needs a JWT; garbage and wrongly-signed tokens are rejected', async () => {
    expect((await h.http().get('/api/v1/auth/me')).status).toBe(401);
    expect((await h.http().get('/api/v1/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);
    const jwt = require('jsonwebtoken');
    const forged = jwt.sign({ sub: '507f1f77bcf86cd799439011', role: 'ADMIN' }, 'attacker-secret');
    expect((await h.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
  });

  test('customer cannot reach admin endpoints; admin can', async () => {
    const admin = await h.createAdmin();
    const c = await h.registerCustomer();
    for (const path of ['/api/v1/users', '/api/v1/admin/orders', '/api/v1/admin/dashboard/stats']) {
      expect((await h.http().get(path).set(h.auth(c))).status).toBe(403);
      expect((await h.http().get(path).set(h.auth(admin))).status).toBe(200);
    }
    const create = await h.http().post('/api/v1/categories').set(h.auth(c)).send({ name: 'X' });
    expect(create.status).toBe(403);
  });

  test('profile update cannot change role; change-password verifies the current password', async () => {
    const c = await h.registerCustomer();
    const role = await h.http().patch('/api/v1/auth/profile').set(h.auth(c)).send({ role: 'ADMIN' });
    expect(role.status).toBe(422);
    const ok = await h.http().patch('/api/v1/auth/profile').set(h.auth(c)).send({ name: 'New Name' });
    expect(ok.body.data.name).toBe('New Name');

    const wrong = await h.http().patch('/api/v1/auth/change-password').set(h.auth(c)).send({ currentPassword: 'Nope1234!', newPassword: 'NewPassw0rd!' });
    expect(wrong.status).toBe(400);
    const good = await h.http().patch('/api/v1/auth/change-password').set(h.auth(c)).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' });
    expect(good.status).toBe(200);
    expect((await h.http().post('/api/v1/auth/login').send({ email: c.email, password: 'NewPassw0rd!' })).status).toBe(200);
  });

  test('refresh rotates the token and a replayed (old) refresh token revokes the session', async () => {
    const c = await h.registerCustomer();
    const cookie1 = c.cookies.map((x) => x.split(';')[0]).join('; ');
    const r1 = await h.http().post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(r1.status).toBe(200);
    expect(r1.body.data.accessToken).toBeTruthy();
    const cookie2 = r1.headers['set-cookie'].map((x) => x.split(';')[0]).join('; ');
    expect(cookie2).not.toBe(cookie1);

    const replay = await h.http().post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(replay.status).toBe(401);
    // reuse detection revoked everything, including the newest token
    const after = await h.http().post('/api/v1/auth/refresh').set('Cookie', cookie2);
    expect(after.status).toBe(401);
  });

  test('admin can list/search/filter users and cannot deactivate admins or self', async () => {
    const admin = await h.createAdmin();
    await h.registerCustomer('Alice Smith');
    await h.registerCustomer('Bob Jones');
    const search = await h.http().get('/api/v1/users?search=alice&role=CUSTOMER').set(h.auth(admin));
    expect(search.body.data).toHaveLength(1);
    expect(search.body.meta).toMatchObject({ total: 1, page: 1 });
    const self = await h.http().patch(`/api/v1/users/${admin.user.id}/status`).set(h.auth(admin)).send({ isActive: false });
    expect(self.status).toBe(400);
  });

  test('NoSQL operator objects in the body are rejected', async () => {
    const res = await h.http().post('/api/v1/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(422);
  });
});
