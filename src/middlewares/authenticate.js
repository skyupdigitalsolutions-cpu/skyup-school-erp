'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');
const ApiError = require('../core/ApiError');
const asyncHandler = require('../core/asyncHandler');
const { TOKEN_TYPES } = require('../utils/constants');

/**
 * Verifies the access token and populates req.user. This is the ENFORCEMENT
 * primitive only — it does not issue tokens or read the users collection.
 * Token issuance, refresh rotation and the user model belong to the
 * Authentication module, which will sign tokens carrying this exact shape:
 *
 *   { sub, tenant, roles: string[], permissions: string[], type: 'access' }
 *
 * The access token is read from the Authorization: Bearer header first, then
 * from the HttpOnly `accessToken` cookie.
 */
function extractToken(req) {
  const auth = req.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  if (req.cookies && req.cookies.accessToken) return req.cookies.accessToken;
  return null;
}

const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) throw ApiError.unauthorized('Authentication token missing.');

  let payload;
  try {
    payload = jwt.verify(token, config.jwt.accessSecret);
  } catch (err) {
    const msg =
      err.name === 'TokenExpiredError'
        ? 'Access token expired.'
        : 'Invalid access token.';
    throw ApiError.unauthorized(msg);
  }

  if (payload.type !== TOKEN_TYPES.ACCESS) {
    throw ApiError.unauthorized('Wrong token type.');
  }

  // Defense in depth: the token's tenant claim must match the resolved school.
  if (req.tenant && payload.tenant && payload.tenant !== req.tenant.id) {
    throw ApiError.forbidden('Token does not belong to this school.');
  }

  req.user = {
    id: payload.sub,
    tenantId: payload.tenant || (req.tenant && req.tenant.id) || null,
    roles: Array.isArray(payload.roles) ? payload.roles : [],
    permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
    // Present only on student-portal tokens (see token.service's `extra`) —
    // undefined for every other role, harmless to carry unconditionally.
    studentId: payload.studentId || null,
    viewerType: payload.viewerType || null,
  };

  next();
});

module.exports = authenticate;
