'use strict';

/**
 * The charter roles. These are the DEFAULT role slugs seeded per school.
 * `PARENT` is distinct from `STUDENT` even though both authenticate against
 * the same StudentAccount/Student record — a family can hold a parent
 * account and a student account on the same student, and fee visibility
 * (a child-data safeguard) is gated on this distinction, not shared.
 *
 * Authorization model (foundation decision, delegated by the product owner):
 *   - Permissions are the atomic unit, expressed as "<resource>:<action>"
 *     strings (e.g. "attendance:mark", "marks:publish", "fee:refund").
 *   - Roles are named bundles of permissions, stored per school in that
 *     school's database so an Administrator can create/edit roles at runtime
 *     (DB-driven RBAC) — the Authorization module will own that CRUD.
 *   - A user's effective permission set is the union of the permissions of the
 *     roles assigned to them. The authorize middleware checks against that set.
 *
 * The foundation only fixes the CONVENTION here. It seeds no permissions and
 * invents no per-module actions — those arrive with each feature module.
 */
const ROLES = Object.freeze({
  ADMINISTRATOR: 'administrator',
  PRINCIPAL: 'principal',
  TEACHER: 'teacher',
  CARETAKER: 'caretaker',
  STUDENT: 'student',
  PARENT: 'parent',
  FINANCE: 'finance',
});

const ROLE_VALUES = Object.freeze(Object.values(ROLES));

/** Canonical action verbs used to compose permission strings. */
const ACTIONS = Object.freeze({
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MANAGE: 'manage', // wildcard over a resource
});

/**
 * Compose a permission string.
 * @example permission('attendance', ACTIONS.MARK) // not built-in; modules define verbs
 */
const permission = (resource, action) => `${resource}:${action}`;

/** Token type discriminators for JWT payloads. */
const TOKEN_TYPES = Object.freeze({
  ACCESS: 'access',
  REFRESH: 'refresh',
});

module.exports = {
  ROLES,
  ROLE_VALUES,
  ACTIONS,
  TOKEN_TYPES,
  permission,
};
