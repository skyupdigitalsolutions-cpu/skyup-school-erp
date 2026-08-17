'use strict';

/**
 * Operational error carrying an HTTP status. Anything thrown as an ApiError is
 * treated as expected (client-facing); anything else is treated as a bug and
 * masked in production by the central error handler.
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   * @param {object} [options]
   * @param {Array}  [options.errors]  field-level validation details
   * @param {string} [options.code]    stable machine-readable error code
   */
  constructor(statusCode, message, { errors = [], code } = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', errors = []) {
    return new ApiError(400, msg, { errors, code: 'BAD_REQUEST' });
  }
  static unauthorized(msg = 'Unauthorized') {
    return new ApiError(401, msg, { code: 'UNAUTHORIZED' });
  }
  static forbidden(msg = 'Forbidden') {
    return new ApiError(403, msg, { code: 'FORBIDDEN' });
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg, { code: 'NOT_FOUND' });
  }
  static conflict(msg = 'Conflict') {
    return new ApiError(409, msg, { code: 'CONFLICT' });
  }
  static unprocessable(msg = 'Unprocessable entity', errors = []) {
    return new ApiError(422, msg, { errors, code: 'UNPROCESSABLE_ENTITY' });
  }
  static tooManyRequests(msg = 'Too many requests') {
    return new ApiError(429, msg, { code: 'RATE_LIMITED' });
  }
  static internal(msg = 'Internal server error') {
    return new ApiError(500, msg, { code: 'INTERNAL_ERROR' });
  }
}

module.exports = ApiError;
