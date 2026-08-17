'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');
const { ROLE_VALUES } = require('../../../utils/constants');

/**
 * One document per role, per tenant DB (database-per-school — same tenancy
 * model as every other collection in this codebase). This is the real,
 * persisted permission grant `AuthService` reads at login/refresh time,
 * replacing the previously-hardcoded `permissions: []`.
 *
 * Deliberately no document for `administrator` — the `authorize` middleware
 * bypasses permission checks for that role unconditionally, so a grant here
 * would be inert. A missing role document means "no permissions" (fails
 * closed), same discipline as every other scope-filter in this codebase.
 */
const rolePermissionSchema = new mongoose.Schema({
  role: { type: String, enum: ROLE_VALUES, required: true, unique: true },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

rolePermissionSchema.plugin(baseSchemaPlugin);
registerModel('RolePermission', rolePermissionSchema);
module.exports = rolePermissionSchema;
