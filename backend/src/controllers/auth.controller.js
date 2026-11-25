const env = require('../config/environment');
const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/ApiResponse');

const COOKIE = 'refreshToken';
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86400000,
});
// Exported for tests (cookie flags are security-relevant).
exports.cookieOptions = cookieOptions;

const clearOptions = () => {
  const { maxAge, ...rest } = cookieOptions();
  return rest;
};

// The refresh token travels only in an HttpOnly cookie; the JSON body carries the access token.
const respond = (res, status, { accessToken, refreshToken, user }, message) => {
  res.cookie(COOKIE, refreshToken, cookieOptions());
  const send = status === 201 ? created : ok;
  return send(res, { accessToken, user }, { message });
};

exports.register = asyncHandler(async (req, res) =>
  respond(res, 201, await authService.register(req.body), 'Registration successful')
);

exports.login = asyncHandler(async (req, res) =>
  respond(res, 200, await authService.login(req.body), 'Login successful')
);

exports.refresh = asyncHandler(async (req, res) => {
  try {
    return respond(res, 200, await authService.refresh(req.cookies[COOKIE]));
  } catch (err) {
    res.clearCookie(COOKIE, clearOptions());
    throw err;
  }
});

exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[COOKIE]);
  res.clearCookie(COOKIE, clearOptions());
  return ok(res, null, { message: 'Logged out' });
});

exports.me = asyncHandler(async (req, res) => ok(res, req.user.toJSON()));

exports.updateProfile = asyncHandler(async (req, res) =>
  ok(res, await authService.updateProfile(req.user, req.body), { message: 'Profile updated' })
);

exports.changePassword = asyncHandler(async (req, res) =>
  respond(res, 200, await authService.changePassword(req.user._id, req.body), 'Password changed')
);
