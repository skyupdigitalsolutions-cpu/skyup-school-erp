'use strict';

const config = require('../config');
const logger = require('../config/logger');
const ApiError = require('../core/ApiError');

/**
 * Single exit point for every error in the application. Translates known error
 * families into clean HTTP responses and masks unexpected errors in production
 * so internal details never leak.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let error = err;

  // --- Normalize well-known non-operational errors into ApiError ---
  if (!(error instanceof ApiError)) {
    if (error.name === 'ValidationError' && error.errors) {
      // Mongoose schema validation
      const details = Object.values(error.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      error = ApiError.unprocessable('Validation failed', details);
    } else if (error.name === 'CastError') {
      error = ApiError.badRequest(`Invalid ${error.path}: ${error.value}`);
    } else if (error.code === 11000) {
      // Mongo duplicate key
      const field = Object.keys(error.keyValue || {})[0] || 'field';
      error = ApiError.conflict(`Duplicate value for "${field}".`);
    } else if (error.name === 'JsonWebTokenError') {
      error = ApiError.unauthorized('Invalid token.');
    } else if (error.name === 'TokenExpiredError') {
      error = ApiError.unauthorized('Token expired.');
    } else {
      error = new ApiError(
        error.statusCode || 500,
        error.message || 'Internal server error',
        { code: 'INTERNAL_ERROR' }
      );
      error.isOperational = false;
    }
  }

  // --- Log: full stack for server errors, terse line for client errors ---
  const context = `${req.method} ${req.originalUrl} tenant=${
    req.tenant ? req.tenant.slug : '-'
  }`;
  if (error.statusCode >= 500 || !error.isOperational) {
    logger.error(`${context} :: ${err.stack || err.message}`);
  } else {
    logger.warn(`${context} :: ${error.statusCode} ${error.message}`);
  }

  const body = {
    success: false,
    message:
      error.isOperational || !config.isProd
        ? error.message
        : 'Something went wrong.',
    code: error.code || 'INTERNAL_ERROR',
  };
  if (error.errors && error.errors.length) body.errors = error.errors;
  if (!config.isProd && error.stack) body.stack = error.stack;

  res.status(error.statusCode || 500).json(body);
}

module.exports = errorHandler;
