const ApiError = require('../utils/ApiError');

/**
 * validate({ body, query, params }) — zod schemas. Parsed (coerced, trimmed, stripped) values
 * replace req.body / req.params; the parsed query is exposed as req.validQuery because
 * Express 5 makes req.query read-only.
 */
const validate = (schemas) => (req, _res, next) => {
  const errors = [];
  const run = (key, source) => {
    if (!schemas[key]) return undefined;
    const result = schemas[key].safeParse(source ?? {});
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({ in: key, field: issue.path.join('.') || undefined, message: issue.message });
      }
      return undefined;
    }
    return result.data;
  };

  const body = run('body', req.body);
  const query = run('query', req.query);
  const params = run('params', req.params);
  const headers = run('headers', req.headers);

  if (errors.length) {
    return next(ApiError.unprocessable('Validation failed', { code: 'VALIDATION_ERROR', errors }));
  }
  if (schemas.body) req.body = body;
  if (schemas.params) req.params = params;
  req.validQuery = query;
  req.validHeaders = headers;
  next();
};

module.exports = validate;
