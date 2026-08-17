'use strict';
const config = require('../../../config');
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const ApiError = require('../../../core/ApiError');
const studentAuthService = require('../services/studentAuth.service');
const tokenService = require('../../authentication/services/token.service');

const REFRESH_COOKIE = 'refreshToken';

// Scoped to its own path so it never collides with the staff refresh cookie
// (same cookie NAME, different path — the browser keeps them separate).
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.secure ? 'none' : 'lax',
    domain: config.cookie.domain,
    path: `${config.apiPrefix}/student-auth`,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7d — align with JWT_REFRESH_EXPIRES_IN
  };
}

const StudentAuthController = {
  login: asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { viewer, accessToken, refreshToken } = await studentAuthService.login({
      db: req.db, tenant: req.tenant, email, password,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return ApiResponse.ok(res, { viewer, accessToken }, 'Signed in.');
  }),

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

    const { viewer, accessToken, refreshToken } = await studentAuthService.refresh({
      db: req.db, tenant: req.tenant, decoded,
    });
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    return ApiResponse.ok(res, { viewer, accessToken }, 'Session refreshed.');
  }),

  logout: asyncHandler(async (req, res) => {
    await studentAuthService.logout({ db: req.db, accountId: req.user.id });
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    return ApiResponse.ok(res, null, 'Signed out.');
  }),

  me: asyncHandler(async (req, res) => {
    const viewer = await studentAuthService.me({ db: req.db, accountId: req.user.id });
    return ApiResponse.ok(res, { viewer }, 'Current viewer.');
  }),
};

module.exports = StudentAuthController;
