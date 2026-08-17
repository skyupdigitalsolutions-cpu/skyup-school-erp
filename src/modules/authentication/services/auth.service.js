'use strict';

const ApiError = require('../../../core/ApiError');
const userRepository = require('../repositories/user.repository');
const tokenService = require('./token.service');
const authorizationService = require('../../authorization/services/AuthorizationService');

/**
 * Authentication business logic. Every method is tenant-scoped: the caller
 * passes the tenant-bound connection (`db`) and the resolved `tenant` so the
 * service never reaches for global state.
 */
const AuthService = {
  /**
   * Validate credentials and issue a token pair.
   * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
   */
  async login({ db, tenant, email, password }) {
    const User = db.model('User');
    const user = await userRepository.findByEmailWithPassword(User, email);

    // Same generic error for "no user" and "wrong password" — no user enumeration.
    if (!user) throw ApiError.unauthorized('Invalid email or password.');

    const matches = await user.comparePassword(password);
    if (!matches) throw ApiError.unauthorized('Invalid email or password.');

    if (user.status !== 'active') {
      throw ApiError.forbidden(`Account is ${user.status}. Contact your administrator.`);
    }

    user.lastLoginAt = new Date();
    await user.save();

    const tokens = await this._issueTokens(db, user, tenant);
    return { user: user.toSafeObject(), ...tokens };
  },

  /**
   * Exchange a valid refresh token for a fresh access token (with rotation).
   * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
   */
  async refresh({ db, tenant, decoded }) {
    const User = db.model('User');
    const user = await User.findById(decoded.sub).exec();

    if (!user || user.status !== 'active') {
      throw ApiError.unauthorized('Session is no longer valid.');
    }
    // Reject refresh tokens issued before the last invalidation.
    if (decoded.ver !== user.tokenVersion) {
      throw ApiError.unauthorized('Session has expired. Please sign in again.');
    }

    const tokens = await this._issueTokens(db, user, tenant);
    return { user: user.toSafeObject(), ...tokens };
  },

  /** Invalidate all refresh tokens for the user (logout everywhere). */
  async logout({ db, userId }) {
    const User = db.model('User');
    await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }).exec();
  },

  /** Current authenticated user's fresh profile. */
  async me({ db, userId }) {
    const User = db.model('User');
    const user = await User.findById(userId).exec();
    if (!user) throw ApiError.notFound('User not found.');
    return user.toSafeObject();
  },

  /**
   * @private build both tokens for a user in a tenant. `permissions` is the
   * REAL effective grant — the union of every one of the user's roles'
   * permissions (see authorization/services/AuthorizationService.js) — not
   * a hardcoded placeholder anymore.
   */
  async _issueTokens(db, user, tenant) {
    const permissions = await authorizationService.getPermissionsForRoles(db, user.roles);
    const accessToken = tokenService.signAccessToken({
      userId: String(user._id),
      tenantId: tenant.id,
      roles: user.roles,
      permissions,
    });
    const refreshToken = tokenService.signRefreshToken({
      userId: String(user._id),
      tenantId: tenant.id,
      tokenVersion: user.tokenVersion,
    });
    return { accessToken, refreshToken };
  },
};

module.exports = AuthService;
