'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

const jsonLimitHandler = (_req, res) =>
  res.status(429).json({
    success: false,
    message: 'Too many requests, please try again later.',
    code: 'RATE_LIMITED',
  });

/** Applied to the whole API surface. */
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

/** Tighter limiter intended for auth-sensitive routes (login, OTP, reset). */
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  handler: jsonLimitHandler,
});

module.exports = { globalLimiter, authLimiter };
