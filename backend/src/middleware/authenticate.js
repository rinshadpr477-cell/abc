const jwt = require('jsonwebtoken');
const env = require('../config/environment');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

function readBearer(req) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    throw ApiError.unauthorized(err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token', {
      code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
    });
  }
  // Always re-read the user: deactivation / role changes take effect immediately.
  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Account no longer exists', { code: 'TOKEN_INVALID' });
  if (!user.isActive) throw ApiError.forbidden('Your account has been deactivated', { code: 'ACCOUNT_INACTIVE' });
  return user;
}

/** Requires a valid access token. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (!token) throw ApiError.unauthorized('Authentication required', { code: 'AUTH_REQUIRED' });
  req.user = await resolveUser(token);
  next();
});

/** Attaches req.user when a valid token is sent; anonymous requests pass through. */
const optionalAuthenticate = asyncHandler(async (req, _res, next) => {
  const token = readBearer(req);
  if (token) req.user = await resolveUser(token);
  next();
});

module.exports = { authenticate, optionalAuthenticate };
