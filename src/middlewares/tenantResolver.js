'use strict';

const asyncHandler = require('../core/asyncHandler');
const ApiError = require('../core/ApiError');
const connectionManager = require('../database/connectionManager');
const { getTenantModel } = require('../database/tenantRegistry');

/**
 * Resolves which school a request belongs to and attaches that school's
 * database connection to the request, enforcing hard data isolation between
 * schools (database-per-school).
 *
 * Resolution order (first match wins):
 *   1. X-Tenant-Id header  (API clients / mobile)
 *   2. Sub-domain          (e.g. greenwood.erp.example.com -> "greenwood")
 *
 * On success it sets:
 *   req.tenant  = { id, slug, name, dbName, status }
 *   req.db      = tenant-bound Mongoose connection (all module models present)
 *
 * Routes that must NOT be tenant-scoped (health checks, platform-level auth)
 * simply do not mount this middleware.
 */
function extractTenantSlug(req) {
  const header = req.get('X-Tenant-Id');
  if (header) return header.trim().toLowerCase();

  const host = req.hostname || '';
  const parts = host.split('.');
  // Only treat as sub-domain when there is one (host.domain.tld).
  if (parts.length >= 3) return parts[0].toLowerCase();

  return null;
}

const tenantResolver = asyncHandler(async (req, _res, next) => {
  const slug = extractTenantSlug(req);
  if (!slug) {
    throw ApiError.badRequest(
      'Unable to resolve school context. Provide the X-Tenant-Id header or use a school sub-domain.'
    );
  }

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOne({ slug }).lean();

  if (!tenant) {
    throw ApiError.notFound(`No school registered for "${slug}".`);
  }
  if (tenant.status !== 'active') {
    throw ApiError.forbidden(`School "${slug}" is ${tenant.status}.`);
  }

  req.tenant = {
    id: String(tenant._id),
    slug: tenant.slug,
    name: tenant.name,
    dbName: tenant.dbName,
    status: tenant.status,
  };
  req.db = await connectionManager.getTenantConnection(tenant);

  next();
});

module.exports = tenantResolver;
