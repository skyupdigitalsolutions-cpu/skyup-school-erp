'use strict';

const ApiError = require('../core/ApiError');
const { ROLES } = require('../utils/constants');

/**
 * RBAC + PBAC enforcement primitives. Both read from req.user (populated by the
 * authenticate middleware) and never touch the database — the effective role
 * and permission sets are carried in the verified access token.
 *
 * Usage in a module route:
 *   router.post('/', authenticate, requirePermissions('student:create'), ctrl.create);
 *   router.get('/reports', authenticate, requireRoles(ROLES.PRINCIPAL), ctrl.reports);
 */

/** Administrators bypass permission checks (full access within their school). */
function isAdministrator(user) {
  return user.roles.includes(ROLES.ADMINISTRATOR);
}

/**
 * Require the user to hold at least one of the given roles.
 * @param {...string} roles
 */
function requireRoles(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    const has = req.user.roles.some((r) => roles.includes(r));
    if (!has) {
      return next(ApiError.forbidden('Insufficient role for this action.'));
    }
    return next();
  };
}

/**
 * Require the user to hold ALL of the given permissions.
 * A permission "resource:manage" implicitly satisfies any "resource:*" check.
 * @param {...string} permissions
 */
function requirePermissions(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (isAdministrator(req.user)) return next();

    const granted = new Set(req.user.permissions);
    const satisfies = (perm) => {
      if (granted.has(perm)) return true;
      const [resource] = perm.split(':');
      return granted.has(`${resource}:manage`);
    };

    const missing = permissions.filter((p) => !satisfies(p));
    if (missing.length > 0) {
      return next(
        ApiError.forbidden(`Missing permission(s): ${missing.join(', ')}`)
      );
    }
    return next();
  };
}

/**
 * Require the user to hold ANY of the given permissions.
 * @param {...string} permissions
 */
function requireAnyPermission(...permissions) {
  return (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (isAdministrator(req.user)) return next();

    const granted = new Set(req.user.permissions);
    const ok = permissions.some((p) => {
      if (granted.has(p)) return true;
      const [resource] = p.split(':');
      return granted.has(`${resource}:manage`);
    });
    if (!ok) {
      return next(ApiError.forbidden('Insufficient permissions.'));
    }
    return next();
  };
}

module.exports = { requireRoles, requirePermissions, requireAnyPermission };
