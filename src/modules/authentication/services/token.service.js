'use strict';

const jwt = require('jsonwebtoken');
const config = require('../../../config');
const { TOKEN_TYPES } = require('../../../utils/constants');

/**
 * Central place for JWT issuance/verification so signing options and payload
 * shape are defined once.
 *
 * Access token  — short-lived, carries authorization claims (roles/permissions),
 *                 sent to the client and used via the Authorization header.
 * Refresh token — longer-lived, carries the user's tokenVersion so it can be
 *                 invalidated server-side; stored in an HttpOnly cookie.
 */
const TokenService = {
  /**
   * `extra` merges additional claims onto the payload — e.g. the student
   * portal embeds `{ studentId, viewerType }` so every downstream request
   * already knows which one student to scope to, without a DB round-trip.
   * Optional and additive: omitting it leaves existing (teacher/staff)
   * tokens byte-for-byte unchanged.
   */
  signAccessToken({ userId, tenantId, roles, permissions = [], extra = {} }) {
    return jwt.sign(
      {
        sub: userId,
        tenant: tenantId,
        roles,
        permissions,
        type: TOKEN_TYPES.ACCESS,
        ...extra,
      },
      config.jwt.accessSecret,
      { expiresIn: config.jwt.accessExpiresIn }
    );
  },

  signRefreshToken({ userId, tenantId, tokenVersion }) {
    return jwt.sign(
      {
        sub: userId,
        tenant: tenantId,
        ver: tokenVersion,
        type: TOKEN_TYPES.REFRESH,
      },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );
  },

  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret);
  },
};

module.exports = TokenService;
