const crypto = require('crypto');
const { execFileSync } = require('child_process');
const path = require('path');
const h = require('../helpers');

const apiRoot = path.join(__dirname, '..', '..', '..');

describe('API docs (Swagger)', () => {
  test('serves the OpenAPI JSON with relative server, bearer auth and shared error responses', async () => {
    const res = await h.http().get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('ABC Ecommerce API');
    expect(res.body.servers).toEqual([{ url: '/api/v1', description: expect.any(String) }]);
    expect(JSON.stringify(res.body)).not.toMatch(/localhost/);
    expect(res.body.components.securitySchemes.bearerAuth).toMatchObject({ type: 'http', scheme: 'bearer' });
    // secured operation: 401/403 documented; public operation: no 401
    expect(res.body.paths['/users'].get.responses['401']).toBeDefined();
    expect(res.body.paths['/products'].get.responses['401']).toBeUndefined();
    expect(res.body.paths['/orders'].post.responses['422']).toBeDefined();
  });

  test('serves Swagger UI', async () => {
    const res = await h.http().get('/api-docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });
});

describe('Production configuration guard', () => {
  // Strong random secrets generated per run (never real credentials, never committed).
  const baseEnv = {
    PATH: process.env.PATH,
    NODE_ENV: 'production',
    JWT_ACCESS_SECRET: crypto.randomBytes(32).toString('hex'),
    JWT_REFRESH_SECRET: crypto.randomBytes(32).toString('hex'),
    // Obviously non-secret placeholder host (.invalid is a reserved TLD); no credentials.
    MONGODB_URI: 'mongodb://mongo.internal.invalid:27017/abc',
    CORS_ORIGIN: 'https://admin.example.com',
  };
  const load = (extra) =>
    execFileSync(process.execPath, ['-e', "console.log(JSON.stringify({s:require('./src/config/environment').swaggerEnabled}))"], {
      cwd: apiRoot,
      env: { ...baseEnv, ...extra },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();

  test('accepts a proper production config; Swagger is off by default there', () => {
    expect(JSON.parse(load({})).s).toBe(false);
    expect(JSON.parse(load({ SWAGGER_ENABLED: 'true' })).s).toBe(true);
  });

  test('development config with localhost values still loads (local dev is unaffected)', () => {
    const out = execFileSync(process.execPath, ['-e', "const e=require('./src/config/environment');console.log(e.swaggerEnabled)"], {
      cwd: apiRoot,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'development',
        JWT_ACCESS_SECRET: 'a'.repeat(40),
        JWT_REFRESH_SECRET: 'b'.repeat(40),
        MONGODB_URI: 'mongodb://localhost:27017/x?replicaSet=rs0',
        CORS_ORIGIN: 'http://localhost:3000',
        SWAGGER_SERVER_URL: 'http://localhost:4000',
      },
    }).toString();
    expect(out.trim()).toBe('true');
  });

  test('Basic auth protects BOTH /api-docs and /api-docs.json in production; API stays public', () => {
    const script = `
      const request = require('supertest'); const app = require('./src/app');
      const b = (c) => 'Basic ' + Buffer.from(c).toString('base64');
      (async () => {
        const r = {};
        r.jsonNone = (await request(app).get('/api-docs.json')).status;
        r.jsonWrong = (await request(app).get('/api-docs.json').set('Authorization', b('reviewer:nope'))).status;
        r.jsonOk = (await request(app).get('/api-docs.json').set('Authorization', b('reviewer:s3cret'))).status;
        r.uiNone = (await request(app).get('/api-docs/')).status;
        r.uiOk = (await request(app).get('/api-docs/').set('Authorization', b('reviewer:s3cret'))).status;
        r.health = (await request(app).get('/health')).status;
        const spec = (await request(app).get('/api-docs.json').set('Authorization', b('reviewer:s3cret'))).body;
        r.server = spec.servers[0].url;
        console.log(JSON.stringify(r));
      })();`;
    const out = execFileSync(process.execPath, ['-e', script], {
      cwd: apiRoot,
      env: { ...baseEnv, SWAGGER_ENABLED: 'true', SWAGGER_USER: 'reviewer', SWAGGER_PASSWORD: 's3cret', SWAGGER_SERVER_URL: 'https://api.example.com' },
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString();
    expect(JSON.parse(out.trim().split('\n').pop())).toEqual({
      jsonNone: 401, jsonWrong: 401, jsonOk: 200, uiNone: 401, uiOk: 200, health: 503 /* reachable without docs credentials; 503 because this child has no database */, server: 'https://api.example.com/api/v1',
    });
  });

  test.each([
    ['CORS_ORIGIN', 'http://localhost:3000'],
    ['MONGODB_URI', 'mongodb://localhost:27017/abc'],
    ['SWAGGER_SERVER_URL', 'http://localhost:4000'],
  ])('refuses to boot when %s points at localhost', (key, value) => {
    expect(() => load({ [key]: value })).toThrow(/Unsafe production configuration/);
  });
});
