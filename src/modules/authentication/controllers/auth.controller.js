'use strict';

const config = require('../../../config');
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const ApiError = require('../../../core/ApiError');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');

const REFRESH_COOKIE = 'refreshToken';

/** Cookie options for the HttpOnly refresh token. */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.secure ? 'none' : 'lax',
    domain: config.cookie.domain,
    // Scope the cookie to the refresh endpoint only.
    path: `${config.apiPrefix}/auth`,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d — align with JWT_REFRESH_EXPIRES_IN
  };
}

const AuthController = {
  /** POST /auth/login  (tenant-scoped) */
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login({
      db: req.db,
      tenant: req.tenant,
      email,
      password,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    // Access token is returned in the body — the client keeps it in memory.
    return ApiResponse.ok(res, { user, accessToken }, 'Signed in.');
  }),

  /** POST /auth/refresh  (tenant-scoped) */
  refresh: asyncHandler(async (req, res) => {
    const token = req.cookies ? req.cookies[REFRESH_COOKIE] : null;
    if (!token) throw ApiError.unauthorized('No refresh token provided.');

    let decoded;
    try {
      decoded = tokenService.verifyRefreshToken(token);
    } catch (_) {
      throw ApiError.unauthorized('Invalid or expired session.');
    }
    if (req.tenant && decoded.tenant && decoded.tenant !== req.tenant.id) {
      throw ApiError.forbidden('Session does not belong to this school.');
    }

    const { user, accessToken, refreshToken } = await authService.refresh({
      db: req.db,
      tenant: req.tenant,
      decoded,
    });

    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return ApiResponse.ok(res, { user, accessToken }, 'Session refreshed.');
  }),

  /** POST /auth/logout  (authenticated) */
  logout: asyncHandler(async (req, res) => {
    await authService.logout({ db: req.db, userId: req.user.id });
    res.clearCookie(REFRESH_COOKIE, {
      ...refreshCookieOptions(),
      maxAge: undefined,
    });
    return ApiResponse.ok(res, null, 'Signed out.');
  }),

  /** GET /auth/me  (authenticated) */
  me: asyncHandler(async (req, res) => {
    const user = await authService.me({ db: req.db, userId: req.user.id });
    return ApiResponse.ok(res, { user }, 'Current user.');
  }),
};

module.exports = AuthController;
