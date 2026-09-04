'use strict';

const config = require('../../../config');
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const ApiError = require('../../../core/ApiError');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');

const REFRESH_COOKIE = 'refreshToken';

/**
 * Cookie options for the HttpOnly refresh token.
 *
 * `secure`/`sameSite` fall back to `config.isProd` rather than trusting
 * COOKIE_SECURE alone: the frontend (Cloudflare Workers) and backend
 * (Railway) live on different origins, so this cookie is cross-site by
 * definition. A cross-site cookie MUST be `Secure; SameSite=None` or the
 * browser silently refuses to send it back — leaving `COOKIE_SECURE` unset
 * in production looked fine locally (same-origin) but broke every session
 * refresh in the deployed app. Explicitly setting COOKIE_SECURE=true still
 * works the same; this just stops a forgotten env var from reintroducing
 * the bug.
 *
 * `domain` is omitted entirely unless COOKIE_DOMAIN is explicitly set to a
 * real value. A cookie's Domain attribute must match the responding host
 * (or a parent of it) or the browser rejects the cookie outright — the old
 * 'localhost' default meant the cookie was silently dropped on every
 * non-localhost deployment.
 */
function refreshCookieOptions() {
  const secure = config.cookie.secure || config.isProd;
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    ...(config.cookie.domain ? { domain: config.cookie.domain } : {}),
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
