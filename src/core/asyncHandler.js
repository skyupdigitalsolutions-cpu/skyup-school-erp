'use strict';

/**
 * Wraps an async route/controller so any thrown error or rejected promise is
 * forwarded to Express's error pipeline (our central error handler) instead of
 * crashing the process or hanging the request. Removes the need for a
 * try/catch in every controller.
 *
 * @param {Function} fn async (req, res, next) => any
 * @returns {Function}
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
