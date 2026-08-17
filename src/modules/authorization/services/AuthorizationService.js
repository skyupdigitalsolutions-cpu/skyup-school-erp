'use strict';
const ApiError = require('../../../core/ApiError');
const { ROLE_VALUES } = require('../../../utils/constants');
const { PERMISSION_CATALOG, DEFAULT_ROLE_PERMISSIONS } = require('../permissions.catalog');

class AuthorizationService {
  _m(db) { return db.model('RolePermission'); }

  /**
   * Idempotent, self-healing seed: for every role in the default policy,
   * create its RolePermission doc ONLY if one doesn't already exist.
   * `$setOnInsert` is the load-bearing detail here — it never touches an
   * EXISTING document, so re-running this (which happens on every login,
   * see getPermissionsForRoles) can never duplicate a role's doc (the
   * unique index on `role` would reject a duplicate anyway) and can never
   * clobber permissions an administrator has since customized at runtime
   * via updateRolePermissions(). It IS self-healing for schema evolution:
   * if a new role gets added to DEFAULT_ROLE_PERMISSIONS later, the next
   * login backfills a default doc for it without touching any other role.
   */
  async ensureDefaultsSeeded(db) {
    const RolePermission = this._m(db);
    await Promise.all(
      Object.entries(DEFAULT_ROLE_PERMISSIONS).map(([role, permissions]) =>
        RolePermission.findOneAndUpdate(
          { role },
          { $setOnInsert: { role, permissions } },
          { upsert: true, setDefaultsOnInsert: true }
        )
      )
    );
  }

  /** The effective permission set for a user holding one or more roles — the union across all of them, deduplicated. */
  async getPermissionsForRoles(db, roles) {
    if (!roles?.length) return [];
    await this.ensureDefaultsSeeded(db);

    const docs = await this._m(db).find({ role: { $in: roles } }).lean();
    const set = new Set();
    docs.forEach((d) => (d.permissions || []).forEach((p) => set.add(p)));
    return [...set];
  }

  /** GET /authorization/roles — administrator-only view of every role's current grant (defaults + any customization). */
  async listRolePermissions(db) {
    await this.ensureDefaultsSeeded(db);
    return this._m(db).find({}).sort({ role: 1 }).lean();
  }

  /**
   * PATCH /authorization/roles/:role — administrator customizes a role's
   * grant. Every permission must already be a real, enforced one from the
   * catalog — this can never grant something no route actually checks, and
   * can never be used to grant `administrator` anything (it isn't a valid
   * target; its bypass is unconditional and role-based, not grant-based).
   */
  async updateRolePermissions(db, role, permissions, actorId) {
    if (!ROLE_VALUES.includes(role)) throw ApiError.badRequest(`Unknown role: ${role}`);
    if (role === 'administrator') {
      throw ApiError.badRequest('administrator bypasses permission checks entirely — nothing to grant.');
    }
    const invalid = (permissions || []).filter((p) => !PERMISSION_CATALOG.includes(p));
    if (invalid.length) {
      throw ApiError.badRequest(`Unknown permission(s), not enforced by any route: ${invalid.join(', ')}`);
    }

    return this._m(db).findOneAndUpdate(
      { role },
      { $set: { role, permissions, updatedBy: actorId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
}

module.exports = new AuthorizationService();
