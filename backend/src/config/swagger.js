const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const env = require('./environment');

const SPEC_PATH = path.join(__dirname, '..', '..', 'docs', 'openapi.yaml');
const ERR = { $ref: '#/components/schemas/Error' };
const errorResponse = (description) => ({ description, content: { 'application/json': { schema: ERR } } });

/**
 * Loads docs/openapi.yaml and completes it at runtime:
 *  - `servers` comes from SWAGGER_SERVER_URL, or the relative "/api/v1" (same host as the docs);
 *  - every operation gets the shared error responses (422/429/500, plus 401/403 when secured);
 *  - 2xx responses without a body schema get the standard success envelope.
 */
function buildSpec() {
  const spec = YAML.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  spec.servers = [
    env.SWAGGER_SERVER_URL
      ? { url: `${env.SWAGGER_SERVER_URL.replace(/\/+$/, '')}/api/v1`, description: 'Deployed API' }
      : { url: '/api/v1', description: 'Same host that serves this documentation' },
  ];
  spec.components.schemas.SuccessEnvelope = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      message: { type: 'string' },
      data: { description: 'Endpoint specific payload (see description)' },
      meta: { $ref: '#/components/schemas/Meta' },
    },
  };

  for (const methods of Object.values(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
      const secured = op.security === undefined || op.security.length > 0; // global bearer default
      op.responses = op.responses || {};
      for (const [code, res] of Object.entries(op.responses)) {
        if (code.startsWith('2') && !res.content && code !== '204') {
          res.content = { 'application/json': { schema: { $ref: '#/components/schemas/SuccessEnvelope' } } };
        }
      }
      if (secured) {
        op.responses['401'] = op.responses['401'] || errorResponse('Missing, invalid or expired access token');
        op.responses['403'] = op.responses['403'] || errorResponse('Role not allowed or account deactivated');
      }
      if (op.requestBody || (op.parameters || []).some((p) => p.in === 'query')) {
        op.responses['422'] = op.responses['422'] || errorResponse('Validation failed (`errors[]` lists field messages)');
      }
      op.responses['429'] = op.responses['429'] || errorResponse('Rate limit exceeded');
      op.responses['500'] = op.responses['500'] || errorResponse('Unexpected server error (no internal details are exposed)');
    }
  }
  return spec;
}

function basicAuthGate(req, res, next) {
  if (!env.SWAGGER_USER || !env.SWAGGER_PASSWORD) return next();
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const idx = decoded.indexOf(':');
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    const same = (a, b) => {
      const ha = crypto.createHash('sha256').update(a).digest();
      const hb = crypto.createHash('sha256').update(b).digest();
      return crypto.timingSafeEqual(ha, hb);
    };
    if (idx >= 0 && same(user, env.SWAGGER_USER) && same(pass, env.SWAGGER_PASSWORD)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="ABC Ecommerce API docs"');
  return res.status(401).send('Authentication required');
}

/** Mounts Swagger UI at /api-docs and the raw OpenAPI JSON at /api-docs.json (when enabled). */
function mountSwagger(app) {
  if (!env.swaggerEnabled) return false;
  if (env.isProd && !(env.SWAGGER_USER && env.SWAGGER_PASSWORD)) {
    console.warn('[swagger] API docs are PUBLIC in production; set SWAGGER_USER and SWAGGER_PASSWORD to restrict them.');
  }
  const spec = buildSpec();
  app.get('/api-docs.json', basicAuthGate, (_req, res) => res.json(spec));
  app.use(
    '/api-docs',
    basicAuthGate,
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'ABC Ecommerce API',
      swaggerOptions: { persistAuthorization: true },
    })
  );
  return true;
}

module.exports = { mountSwagger, buildSpec };
