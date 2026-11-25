const rateLimit = require('express-rate-limit');
const env = require('../config/environment');

const make = (windowMs, limit, message) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, res) => res.status(429).json({ success: false, code: 'RATE_LIMITED', message }),
  });

const apiLimiter = make(15 * 60 * 1000, 600, 'Too many requests, please try again later');
// Brute-force protection on login / register / refresh.
const authLimiter = make(15 * 60 * 1000, 30, 'Too many authentication attempts, please try again later');

module.exports = { apiLimiter, authLimiter };
