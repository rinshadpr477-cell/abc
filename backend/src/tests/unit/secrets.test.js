const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { assessSecret } = require('../../config/secretStrength');

const apiRoot = path.join(__dirname, '..', '..', '..');
const strong = () => crypto.randomBytes(32).toString('hex');

/** Parses KEY=value pairs from backend/.env.example (the exact values a careless deployer would copy). */
const exampleValues = () =>
  Object.fromEntries(
    fs.readFileSync(path.join(apiRoot, '.env.example'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith('#') && l.includes('='))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );

/** Boots config/environment.js in a child process with the given env; returns { ok, stderr }. */
function boot(env) {
  try {
    execFileSync(process.execPath, ['-e', "require('./src/config/environment')"], {
      cwd: apiRoot,
      env: { PATH: process.env.PATH, MONGODB_URI: 'mongodb://mongo.internal.invalid:27017/abc', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stderr: '' };
  } catch (e) {
    return { ok: false, stderr: String(e.stderr || '') + String(e.message || '') };
  }
}

const prod = (extra) => ({ NODE_ENV: 'production', CORS_ORIGIN: 'https://admin.example.com', JWT_ACCESS_SECRET: strong(), JWT_REFRESH_SECRET: strong(), ...extra });

describe('assessSecret (unit)', () => {
  test('accepts strong random secrets', () => {
    expect(assessSecret(strong())).toEqual([]);
    expect(assessSecret(crypto.randomBytes(48).toString('base64'))).toEqual([]);
  });

  test.each([
    ['too short', 'abc123XYZ'],
    ['placeholder prefix', 'change-me-' + strong()],
    ['placeholder prefix (changeme)', 'ChangeMe' + strong()],
    ['placeholder prefix (your-)', 'your-secret-key-' + strong().slice(0, 20)],
    ['placeholder prefix (secret)', 'secret' + strong()],
    ['placeholder word', strong().slice(0, 20) + 'example' + strong().slice(0, 20)],
    ['repetitive', 'a'.repeat(64)],
    ['low variety', 'abababababababababababababababababababab'],
    ['not a string', undefined],
  ])('rejects %s', (_label, value) => {
    expect(assessSecret(value).length).toBeGreaterThan(0);
  });

  test('reasons never contain the secret value', () => {
    const value = 'change-me-this-exact-text-must-not-leak-1234567890';
    expect(JSON.stringify(assessSecret(value))).not.toContain('this-exact-text');
  });
});

describe('production secret validation (config/environment.js)', () => {
  test('the CURRENT .env.example JWT values are rejected in production', () => {
    const ex = exampleValues();
    expect(ex.JWT_ACCESS_SECRET).toBeTruthy();
    const r = boot(prod({ JWT_ACCESS_SECRET: ex.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: ex.JWT_REFRESH_SECRET }));
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/JWT_ACCESS_SECRET is a publicly known example value/);
    expect(r.stderr).toMatch(/JWT_REFRESH_SECRET is a publicly known example value/);
  });

  test('a single placeholder secret is enough to refuse to start', () => {
    const r = boot(prod({ JWT_REFRESH_SECRET: 'change-me-' + strong() }));
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/JWT_REFRESH_SECRET starts with a placeholder prefix/);
    expect(r.stderr).not.toMatch(/JWT_ACCESS_SECRET/);
  });

  test('identical access and refresh secrets are rejected', () => {
    const s = strong();
    const r = boot(prod({ JWT_ACCESS_SECRET: s, JWT_REFRESH_SECRET: s }));
    expect(r.ok).toBe(false);
    expect(r.stderr).toMatch(/must differ/);
  });

  test('weak (repetitive / short) secrets are rejected', () => {
    expect(boot(prod({ JWT_ACCESS_SECRET: 'x'.repeat(48) })).ok).toBe(false);
    expect(boot(prod({ JWT_ACCESS_SECRET: strong().slice(0, 20) })).ok).toBe(false);
  });

  test('strong, distinct production secrets are accepted', () => {
    expect(boot(prod({})).ok).toBe(true);
  });

  test('error output never prints the secret values', () => {
    const access = 'change-me-' + strong();
    const refresh = 'change-me-' + strong();
    const r = boot(prod({ JWT_ACCESS_SECRET: access, JWT_REFRESH_SECRET: refresh }));
    expect(r.ok).toBe(false);
    expect(r.stderr).not.toContain(access);
    expect(r.stderr).not.toContain(refresh);
    expect(r.stderr).not.toContain(access.slice(10, 40));
    const ex = exampleValues();
    const r2 = boot(prod({ JWT_ACCESS_SECRET: ex.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: ex.JWT_REFRESH_SECRET }));
    expect(r2.stderr).not.toContain(ex.JWT_ACCESS_SECRET);
    expect(r2.stderr).not.toContain(ex.JWT_REFRESH_SECRET);
  });
});

describe('development compatibility', () => {
  test('the example values still work for local development', () => {
    const ex = exampleValues();
    const r = boot({ NODE_ENV: 'development', JWT_ACCESS_SECRET: ex.JWT_ACCESS_SECRET, JWT_REFRESH_SECRET: ex.JWT_REFRESH_SECRET, CORS_ORIGIN: 'http://localhost:3000' });
    expect(r.ok).toBe(true);
  });

  test('development still enforces the minimum length and distinct secrets', () => {
    const base = { NODE_ENV: 'development' };
    expect(boot({ ...base, JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: strong() }).ok).toBe(false);
    const same = strong();
    expect(boot({ ...base, JWT_ACCESS_SECRET: same, JWT_REFRESH_SECRET: same }).ok).toBe(false);
  });
});
