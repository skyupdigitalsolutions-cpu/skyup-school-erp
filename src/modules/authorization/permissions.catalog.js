'use strict';

/**
 * The AUTHORITATIVE permission catalog — every permission string actually
 * enforced by a `requirePermissions(...)`/`requireAnyPermission(...)` call
 * anywhere in this server, confirmed by grepping the whole codebase (2026-08-16):
 *
 *   grep -rn "requirePermissions(\|requireAnyPermission(" src
 *
 * The full result set was exactly `student:read`, `student:create`,
 * `student:update` and `teacher:read`, `teacher:create`, `teacher:update` —
 * all in `modules/principal/routes/index.js`. NOTHING else in this codebase
 * gates on permissions; every other module (finance, caretaker-transport,
 * expenses, student-*, etc.) gates on `requireRoles(...)` instead, which
 * reads `req.user.roles` directly and needs no permission grant at all.
 *
 * Do NOT add a permission string here that isn't enforced by a real route —
 * a granted-but-unenforced permission is dead weight that only creates false
 * confidence about what a role can actually do.
 */
const PERMISSION_CATALOG = Object.freeze([
  'student:read', 'student:create', 'student:update',
  'teacher:read', 'teacher:create', 'teacher:update',
]);

/**
 * Default role → permission policy. `administrator` is deliberately absent —
 * `middlewares/authorize.js`'s `isAdministrator()` bypasses every permission
 * check unconditionally, so granting it anything here would be dead data,
 * not a stronger guarantee. `caretaker`/`student`/`parent` are also absent —
 * their routes are entirely `requireRoles`-gated (confirmed by the same
 * grep), so they have zero enforced permissions to grant.
 *
 * `:manage` is a wildcard the `authorize` middleware already understands
 * (`requirePermissions('student:read')` is satisfied by a granted
 * `student:manage`) — used here for principal's full CRUD rather than
 * listing every individual student:read/create/update permission.
 */
const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  principal: ['student:manage', 'teacher:manage'],
  finance: ['student:read', 'teacher:read'], // read-only — no write permission on either resource
  teacher: ['student:read'], // a teacher views their own students; no teacher-directory access by default
});

module.exports = { PERMISSION_CATALOG, DEFAULT_ROLE_PERMISSIONS };
