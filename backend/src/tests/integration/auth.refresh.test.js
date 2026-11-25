const jwt = require('jsonwebtoken');
const h = require('../helpers');
const env = require('../../config/environment');
const { cookieOptions } = require('../../controllers/auth.controller');

const { User } = h.models;

beforeAll(() => h.connect('t_refresh'));
afterAll(() => h.disconnect());
beforeEach(() => h.clearAll());

const cookieOf = (res) => (res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).find((c) => c.startsWith('refreshToken='));
const refresh = (cookie) => {
  const r = h.http().post('/api/v1/auth/refresh');
  return cookie ? r.set('Cookie', cookie) : r;
};
const fresh = async () => {
  const c = await h.registerCustomer();
  return { ...c, cookie: cookieOf({ headers: { 'set-cookie': c.cookies } }) };
};
/** Makes the rotated ("previous") ids of every family look older than the grace period. */
const ageRotations = (userId, ms = 60_000) =>
  User.updateOne({ _id: userId }, { $set: { 'sessions.$[].previous.$[].rotatedAt': new Date(Date.now() - ms) } });
const sessionsOf = async (userId) => (await User.findById(userId).select('+sessions')).sessions;

describe('refresh-token rotation', () => {
  test('1. normal refresh: new access token, rotated cookie, user returned, no secrets in body', async () => {
    const c = await fresh();
    const r = await refresh(c.cookie);
    expect(r.status).toBe(200);
    expect(r.body.data.accessToken).toBeTruthy();
    expect(r.body.data.user.email).toBe(c.email);
    const next = cookieOf(r);
    expect(next).toBeTruthy();
    expect(next).not.toBe(c.cookie);
    expect(JSON.stringify(r.body)).not.toMatch(/refreshToken|jtiHash|sessions|password/);
    // the new access token works
    expect((await h.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${r.body.data.accessToken}`)).status).toBe(200);
    // the new refresh token works
    expect((await refresh(next)).status).toBe(200);
  });

  test('2. concurrent refresh requests with the same cookie all succeed and every issued token stays usable', async () => {
    const c = await fresh();
    const results = await Promise.all([refresh(c.cookie), refresh(c.cookie), refresh(c.cookie)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const cookies = results.map(cookieOf);
    expect(new Set(cookies).size).toBe(3); // each got its own rotated token
    // whichever Set-Cookie the browser kept, it still works
    for (const ck of cookies) expect((await refresh(ck)).status).toBe(200);
    // and the account was NOT logged out of its other devices
    expect((await h.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${results[0].body.data.accessToken}`)).status).toBe(200);
  });

  test('3. lost response: the client retries with the OLD cookie and gets a working session', async () => {
    const c = await fresh();
    const first = await refresh(c.cookie); // response "lost": the client never stored cookieOf(first)
    expect(first.status).toBe(200);
    const retry = await refresh(c.cookie);
    expect(retry.status).toBe(200);
    expect((await refresh(cookieOf(retry))).status).toBe(200);
  });

  test('4. reuse WITHIN the grace period is accepted', async () => {
    const c = await fresh();
    expect((await refresh(c.cookie)).status).toBe(200);
    expect((await refresh(c.cookie)).status).toBe(200);
    expect((await refresh(c.cookie)).status).toBe(200);
  });

  test('4b. many rapid rotations inside the grace window do not push the oldest id out (no false theft alarm)', async () => {
    const c = await fresh();
    let current = c.cookie;
    for (let i = 0; i < 12; i++) {
      const r = await refresh(current);
      expect(r.status).toBe(200);
      current = cookieOf(r);
    }
    // the very first cookie was rotated 12 times ago but is still inside the grace window
    expect((await refresh(c.cookie)).status).toBe(200);
    expect(await sessionsOf(c.user.id)).toHaveLength(1);
  });

  test('5. reuse AFTER the grace period is treated as theft: that family is revoked, and the old token is not reusable', async () => {
    const c = await fresh();
    const r1 = await refresh(c.cookie);
    const current = cookieOf(r1);
    await ageRotations(c.user.id);

    const replay = await refresh(c.cookie);
    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_REUSED');
    // the family is gone, so even the "current" token is dead (the legitimate user must log in again)
    const after = await refresh(current);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('REFRESH_INVALID');
    expect(await sessionsOf(c.user.id)).toHaveLength(0);
  });

  test('5b. grace is bounded by REFRESH_GRACE_SECONDS (a token just inside the window works, just outside does not)', async () => {
    const graceMs = env.refreshGraceMs;
    expect(graceMs).toBeGreaterThan(0);
    const c = await fresh();
    await refresh(c.cookie);
    await ageRotations(c.user.id, graceMs - 2000);
    expect((await refresh(c.cookie)).status).toBe(200);
    const d = await fresh();
    await refresh(d.cookie);
    await ageRotations(d.user.id, graceMs + 1000);
    expect((await refresh(d.cookie)).status).toBe(401);
  });

  test('6. refresh after logout is rejected, and logout only ends that device', async () => {
    const a = await fresh();
    const loginB = await h.login(a.email);
    const cookieB = cookieOf({ headers: { 'set-cookie': loginB.cookies } });
    const out = await h.http().post('/api/v1/auth/logout').set('Cookie', a.cookie);
    expect(out.status).toBe(200);
    expect(out.headers['set-cookie'].join(';')).toMatch(/refreshToken=;/);
    const r = await refresh(a.cookie);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('REFRESH_INVALID');
    expect((await refresh(cookieB)).status).toBe(200); // other device untouched
  });

  test('7. refresh after the session was revoked (deactivation / password change) is rejected', async () => {
    const admin = await h.createAdmin();
    const c = await fresh();
    await h.http().patch(`/api/v1/users/${c.user.id}/status`).set(h.auth(admin)).send({ isActive: false });
    expect((await refresh(c.cookie)).status).toBe(401);

    const d = await fresh();
    const other = await h.login(d.email);
    const otherCookie = cookieOf({ headers: { 'set-cookie': other.cookies } });
    const change = await h.http().patch('/api/v1/auth/change-password').set(h.auth(d)).send({ currentPassword: 'Passw0rd!', newPassword: 'NewPassw0rd!' });
    expect(change.status).toBe(200);
    expect((await refresh(d.cookie)).status).toBe(401);
    expect((await refresh(otherCookie)).status).toBe(401);
    expect((await refresh(cookieOf(change))).status).toBe(200); // the device that changed the password stays signed in
  });

  test('8. invalid tokens are rejected without touching any session', async () => {
    const c = await fresh();
    expect((await refresh()).status).toBe(401);
    expect((await refresh('refreshToken=not-a-jwt')).status).toBe(401);
    const forged = jwt.sign({ sub: c.user.id, fid: 'x', jti: 'y' }, 'some-other-secret-0123456789-0123456789');
    expect((await refresh(`refreshToken=${forged}`)).status).toBe(401);
    // an ACCESS token must not be accepted as a refresh token
    expect((await refresh(`refreshToken=${c.token}`)).status).toBe(401);
    // a legacy-shaped token (no family id) is not accepted
    const legacy = jwt.sign({ sub: c.user.id, jti: 'legacy' }, process.env.JWT_REFRESH_SECRET);
    expect((await refresh(`refreshToken=${legacy}`)).status).toBe(401);
    // an unknown family is a plain 401 (nothing is revoked)
    const unknownFamily = jwt.sign({ sub: c.user.id, fid: 'nope', jti: 'nope' }, process.env.JWT_REFRESH_SECRET);
    const r = await refresh(`refreshToken=${unknownFamily}`);
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('REFRESH_INVALID');
    expect((await refresh(c.cookie)).status).toBe(200); // the real session is untouched
  });

  test('9. independent devices have independent families: theft on one device does not log out the other', async () => {
    const a = await fresh();
    const loginB = await h.login(a.email);
    const cookieB = cookieOf({ headers: { 'set-cookie': loginB.cookies } });
    expect(await sessionsOf(a.user.id)).toHaveLength(2);
    expect(new Set((await sessionsOf(a.user.id)).map((s) => s.fid)).size).toBe(2);

    // device A rotates, then an old A token is replayed after the grace period
    await refresh(a.cookie);
    await ageRotations(a.user.id);
    expect((await refresh(a.cookie)).body.code).toBe('REFRESH_REUSED');

    // device B is unaffected and keeps rotating normally
    const b1 = await refresh(cookieB);
    expect(b1.status).toBe(200);
    expect((await refresh(cookieOf(b1))).status).toBe(200);
    expect(await sessionsOf(a.user.id)).toHaveLength(1);
  });

  test('10. grace-period tokens are scoped to their own family and user', async () => {
    const a = await fresh();
    const b = await fresh();
    await refresh(a.cookie); // a.cookie is now a "previous" id of A's family
    // a.cookie cannot be used against B's family: the family id inside the token decides
    const forgedTokenForB = jwt.sign(
      { sub: b.user.id, fid: (await sessionsOf(a.user.id))[0].fid, jti: jwt.decode(a.cookie.split('=')[1]).jti },
      process.env.JWT_REFRESH_SECRET
    );
    expect((await refresh(`refreshToken=${forgedTokenForB}`)).status).toBe(401);
  });

  test('the database never stores token values, only hashes', async () => {
    const c = await fresh();
    const raw = JSON.stringify(await sessionsOf(c.user.id));
    expect(raw).not.toContain(c.cookie.split('=')[1]);
    expect(raw).not.toContain(jwt.decode(c.cookie.split('=')[1]).jti);
  });
});

describe('refresh cookie flags', () => {
  test('HttpOnly, SameSite=Lax, scoped path; Secure only in production', async () => {
    const c = await h.http().post('/api/v1/auth/register').send({ name: 'Flags', email: 'flags@test.com', password: 'Passw0rd!' });
    const set = c.headers['set-cookie'].find((x) => x.startsWith('refreshToken='));
    expect(set).toMatch(/HttpOnly/i);
    expect(set).toMatch(/SameSite=Lax/i);
    expect(set).toMatch(/Path=\/api\/v1\/auth(;|$)/);
    expect(set).not.toMatch(/;\s*Secure/i); // NODE_ENV=test is not production
    expect(set).toMatch(/Max-Age=\d+/i);

    const original = env.isProd;
    try {
      env.isProd = true;
      expect(cookieOptions()).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth' });
    } finally {
      env.isProd = original;
    }
  });

  test('logout clears the cookie with the same scope', async () => {
    const c = await fresh();
    const out = await h.http().post('/api/v1/auth/logout').set('Cookie', c.cookie);
    const cleared = out.headers['set-cookie'].find((x) => x.startsWith('refreshToken='));
    expect(cleared).toMatch(/Path=\/api\/v1\/auth/);
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  test('the refresh token never appears in a JSON response body', async () => {
    const c = await h.http().post('/api/v1/auth/login').send({ name: 'x', email: 'nobody@test.com', password: 'Passw0rd!' });
    expect(JSON.stringify(c.body)).not.toMatch(/refreshToken/);
    const reg = await h.registerCustomer();
    const me = await h.http().get('/api/v1/auth/me').set(h.auth(reg));
    expect(JSON.stringify(me.body)).not.toMatch(/refreshToken|jtiHash|sessions/);
  });
});
