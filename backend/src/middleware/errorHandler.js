const mongoose = require('mongoose');
const env = require('../config/environment');
const ApiError = require('../utils/ApiError');

const notFound = (req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));

function normalise(err) {
  if (err instanceof ApiError) return err;
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return ApiError.unprocessable('Validation failed', { code: 'VALIDATION_ERROR', errors });
  }
  if (err instanceof mongoose.Error.CastError) return ApiError.badRequest(`Invalid ${err.path}`, { code: 'INVALID_ID' });
  if (err?.code === 11000 || err?.cause?.code === 11000) {
    const keys = Object.keys(err.keyPattern || err.cause?.keyPattern || {});
    return ApiError.conflict(`Duplicate value${keys.length ? ` for ${keys.join(', ')}` : ''}`, { code: 'DUPLICATE_KEY' });
  }
  if (err?.type === 'entity.parse.failed') return ApiError.badRequest('Malformed JSON body');
  if (err?.type === 'entity.too.large') return new ApiError(413, 'Request body too large');
  return null;
}

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, _next) => {
  const known = normalise(err);
  if (!known) {
    // Unknown error: log fully server-side, never leak details to the client.
    if (!env.isTest) console.error('[unhandled]', err);
    return res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
      ...(env.isProd ? {} : { debug: err?.message }),
    });
  }
  const body = { success: false, message: known.message };
  if (known.code) body.code = known.code;
  if (known.errors) body.errors = known.errors;
  res.status(known.statusCode).json(body);
};

module.exports = { notFound, errorHandler };
