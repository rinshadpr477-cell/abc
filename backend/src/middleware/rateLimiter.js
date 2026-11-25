const rateLimit = require('express-rate-limit');
const env = require('../config/environment');
const { sha256 } = require('../utils/helpers');

const WINDOW_MS = 15 * 60 * 1000;
const REFRESH_COOKIE = 'refreshToken';

/**
 * 429 responses carry only a code and a generic message; no session data, tokens or keys.
 * `skip` is evaluated per request, so tests can turn limiting on with RATE_LIMIT_ENABLED=true.
 */
const make = (limit, message, extra = {}) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !env.rateLimitEnabled,
    handler: (_req, res) => res.status(429).json({ success: false, code: 'RATE_LIMITED', message }),
    ...extra,
  });

const apiLimiter = make(env.API_RATE_LIMIT_MAX, 'Too many requests, please try again later');

// Brute-force protection on login and register only.
const authLimiter = make(env.AUTH_RATE_LIMIT_MAX, 'Too many authentication attempts, please try again later');

// /auth/refresh has its own budget, because every page load and every tab calls it.
//  1. per client IP (generous: normal reloads and several tabs)
//  2. per refresh token: a hash of the cookie value, so a replayed/looping token is throttled
//     without trusting any client-supplied user identifier. Requests without a cookie are not
//     counted here (the IP limiter still covers them).
const refreshIpLimiter = make(env.REFRESH_RATE_LIMIT_MAX, 'Too many session refresh requests, please try again later');
const refreshTokenLimiter = make(env.REFRESH_TOKEN_RATE_LIMIT_MAX, 'Too many session refresh requests, please try again later', {
  skip: (req) => !env.rateLimitEnabled || !(req.cookies && req.cookies[REFRESH_COOKIE]),
  keyGenerator: (req) => `rt:${sha256(String(req.cookies[REFRESH_COOKIE]))}`,
});
const refreshLimiter = [refreshIpLimiter, refreshTokenLimiter];

module.exports = { apiLimiter, authLimiter, refreshLimiter };
