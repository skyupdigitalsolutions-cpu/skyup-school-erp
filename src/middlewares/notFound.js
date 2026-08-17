'use strict';

const ApiError = require('../core/ApiError');

/** Converts any unmatched route into a 404 handled by the central error handler. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
