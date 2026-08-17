'use strict';

const helmet = require('helmet');
const cors = require('cors');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const xss = require('xss');
const config = require('../config');
const ApiError = require('../core/ApiError');

/** Strict CORS: only origins from config are allowed; credentials enabled for cookies. */
const corsMiddleware = cors({
  origin(origin, callback) {
    // Allow non-browser clients (no origin) and whitelisted origins.
    if (!origin || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(ApiError.forbidden(`Origin not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Id'],
});

/**
 * Recursively sanitize string values in req.body / req.params against stored
 * XSS. Query is treated read-only in Express 5-style getters, so we only clean
 * mutable containers.
 */
function xssClean(req, _res, next) {
  const clean = (value) => {
    if (typeof value === 'string') return xss(value);
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = clean(value[key]);
      return value;
    }
    return value;
  };
  if (req.body) req.body = clean(req.body);
  if (req.params) req.params = clean(req.params);
  next();
}

/**
 * Ordered array of security middlewares mounted early in the pipeline.
 */
function securityMiddlewares() {
  return [
    helmet({
      contentSecurityPolicy: config.isProd ? undefined : false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
    corsMiddleware,
    mongoSanitize(), // strips $ and . from keys to block operator injection
    hpp(), // guards against HTTP parameter pollution
    xssClean,
  ];
}

module.exports = { securityMiddlewares, corsMiddleware };
