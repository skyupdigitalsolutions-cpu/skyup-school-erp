'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../core/ApiError');

/**
 * Centralized validation so no module has to hand-roll error shaping.
 *
 * Two supported styles (both listed in the charter's stack):
 *
 * 1) Joi — pass a schema keyed by request part:
 *      validate({ body: createStudentSchema, query: listSchema })
 *
 * 2) express-validator — mount the chains, then call `runValidations` last:
 *      router.post('/', body('email').isEmail(), runValidations, ctrl.create)
 *
 * By default unknown keys are stripped (existing behavior, unchanged). Pass
 * `{ stripUnknown: false }` for security-sensitive allow-list schemas where a
 * forbidden/unknown field must be REJECTED with an error instead of silently
 * dropped — e.g. a self-service profile update that must never let a caller
 * sneak in `professional.designation`.
 */

const PARTS = ['body', 'query', 'params'];

function validate(schemas = {}, { stripUnknown = true } = {}) {
  return (req, _res, next) => {
    const errors = [];
    for (const part of PARTS) {
      if (!schemas[part]) continue;
      const { error, value } = schemas[part].validate(req[part], {
        abortEarly: false,
        stripUnknown,
        convert: true,
      });
      if (error) {
        error.details.forEach((d) =>
          errors.push({ field: `${part}.${d.path.join('.')}`, message: d.message })
        );
      } else {
        // express keeps req.query as a getter in some versions; guard the write.
        try {
          req[part] = value;
        } catch (_) {
          /* read-only container — leave as-is */
        }
      }
    }
    if (errors.length) {
      return next(ApiError.unprocessable('Validation failed', errors));
    }
    return next();
  };
}

/** Terminal middleware for express-validator chains. */
function runValidations(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({
    field: e.path || e.param,
    message: e.msg,
  }));
  return next(ApiError.unprocessable('Validation failed', errors));
}

module.exports = { validate, runValidations };
